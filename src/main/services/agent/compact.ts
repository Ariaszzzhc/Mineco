import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { Message, ProviderConfig, ToolResultPart } from '../../../shared/types';
import { AnthropicProvider } from '../provider/anthropic';
import { createLogger } from '../logger';

const log = createLogger('Compact');

// Fallback threshold for first-round heuristic (no actual inputTokens yet)
export const TOKEN_THRESHOLD = 160_000;

// Buffer below context window to trigger compaction
const COMPACT_BUFFER = 20_000;

// Prune: protect the most recent N tokens of tool results from pruning
const PRUNE_PROTECT_TOKENS = 40_000;

// Prune: only execute if pruneable content exceeds this minimum
const PRUNE_MINIMUM = 20_000;

const KEEP_RECENT = 3;

export function estimateTokens(messages: Message[]): number {
  return JSON.stringify(messages).length / 4;
}

/**
 * Check if compaction is needed based on actual token usage from the API.
 */
export function shouldCompact(inputTokens: number, contextWindow: number): boolean {
  if (inputTokens === 0) return false;
  return inputTokens >= contextWindow - COMPACT_BUFFER;
}

/**
 * Incremental prune: mark old, large tool results with compactedAt.
 * Works backward from the end, protecting the most recent user turns.
 * Modifies messages in-place.
 */
export function pruneToolResults(messages: Message[]): { pruned: boolean; prunedCount: number } {
  // Find the boundary: skip the last 2 user turns (protect recent context)
  let userTurnsSeen = 0;
  let protectBoundary = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      userTurnsSeen++;
      if (userTurnsSeen >= 2) {
        protectBoundary = i;
        break;
      }
    }
  }

  // Collect pruneable tool-result parts (before the protection boundary)
  const candidates: Array<{ part: ToolResultPart; estimatedTokens: number }> = [];
  let totalPruneableTokens = 0;

  for (let i = 0; i < protectBoundary; i++) {
    const msg = messages[i];
    for (const part of msg.parts) {
      if (part.type === 'tool-result') {
        if (part.compactedAt) {
          // Already pruned — stop scanning further back
          continue;
        }
        const resultStr = typeof part.result === 'string' ? part.result : JSON.stringify(part.result);
        const estimated = resultStr.length / 4;
        if (estimated > 25) { // Only consider non-trivial results
          candidates.push({ part, estimatedTokens: estimated });
          totalPruneableTokens += estimated;
        }
      }
    }
  }

  if (totalPruneableTokens < PRUNE_MINIMUM) {
    log.info(`Prune: insufficient pruneable content (${Math.round(totalPruneableTokens)} tokens < ${PRUNE_MINIMUM})`);
    return { pruned: false, prunedCount: 0 };
  }

  // Mark candidates for pruning, keeping the most recent ones within PRUNE_PROTECT_TOKENS
  // Work from the end of candidates backward to protect recent ones
  let protectedTokens = 0;
  const toMark: ToolResultPart[] = [];

  for (let i = candidates.length - 1; i >= 0; i--) {
    if (protectedTokens < PRUNE_PROTECT_TOKENS) {
      protectedTokens += candidates[i].estimatedTokens;
    } else {
      toMark.push(candidates[i].part);
    }
  }

  if (toMark.length === 0) {
    log.info('Prune: all candidates within protection window');
    return { pruned: false, prunedCount: 0 };
  }

  const now = Date.now();
  for (const part of toMark) {
    part.compactedAt = now;
  }

  log.info(`Prune: marked ${toMark.length} tool results for compaction`);
  return { pruned: true, prunedCount: toMark.length };
}

/**
 * Micro-compact: clone messages for API call, replacing large/compacted tool results
 * with placeholders. Original messages are not modified.
 */
export function microCompact(messages: Message[]): { messages: Message[]; replacedCount: number } {
  const toolResultPositions: Array<{ msgIdx: number; partIdx: number; toolName: string; size: number; compacted: boolean }> = [];

  for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
    const msg = messages[msgIdx];
    for (let partIdx = 0; partIdx < msg.parts.length; partIdx++) {
      const part = msg.parts[partIdx];
      if (part.type === 'tool-result') {
        const resultStr = typeof part.result === 'string' ? part.result : JSON.stringify(part.result);
        toolResultPositions.push({
          msgIdx,
          partIdx,
          toolName: part.toolName,
          size: resultStr.length,
          compacted: !!part.compactedAt,
        });
      }
    }
  }

  // Eligible for replacement: compactedAt-marked parts OR old large results (position-based)
  const positionBased = toolResultPositions.slice(0, -KEEP_RECENT).filter(p => p.size > 100);
  const compactedBased = toolResultPositions.filter(p => p.compacted && p.size > 100);

  // Merge: use a Set of `${msgIdx}-${partIdx}` to deduplicate
  const eligibleKeys = new Set<string>();
  for (const p of positionBased) {
    eligibleKeys.add(`${p.msgIdx}-${p.partIdx}`);
  }
  for (const p of compactedBased) {
    eligibleKeys.add(`${p.msgIdx}-${p.partIdx}`);
  }

  const eligible = toolResultPositions.filter(p => eligibleKeys.has(`${p.msgIdx}-${p.partIdx}`));

  if (eligible.length === 0) {
    return { messages, replacedCount: 0 };
  }

  const cloned: Message[] = JSON.parse(JSON.stringify(messages));

  for (const pos of eligible) {
    const part = cloned[pos.msgIdx].parts[pos.partIdx];
    if (part.type === 'tool-result') {
      part.result = `[Previous: used ${pos.toolName}]`;
      if (part.diff) {
        delete (part as unknown as Record<string, unknown>).diff;
      }
    }
  }

  return { messages: cloned, replacedCount: eligible.length };
}

const SUMMARY_PROMPT = `You are a conversation summarizer. Summarize the conversation so far in a way that preserves:
1. Key decisions and architectural choices made
2. Important file paths and code patterns discovered
3. Current task progress and remaining work
4. Any errors encountered and how they were resolved

Be concise but thorough. The summary will replace the conversation history, so include all context needed to continue working.`;

export async function fullCompact(
  messages: Message[],
  workingDir: string,
  providerConfig: ProviderConfig,
  focus?: string,
): Promise<{ messages: Message[]; transcriptPath: string }> {
  const transcriptsDir = path.join(workingDir, '.mineco', 'transcripts');
  if (!fs.existsSync(transcriptsDir)) {
    fs.mkdirSync(transcriptsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const transcriptPath = path.join(transcriptsDir, `transcript_${timestamp}.jsonl`);

  const lines = messages.map(m => JSON.stringify(m)).join('\n');
  fs.writeFileSync(transcriptPath, lines, 'utf-8');
  log.info('Transcript saved to:', transcriptPath);

  // Micro-compact the messages sent for summarization to avoid context overflow
  const { messages: compactedForSummary } = microCompact(messages);

  const provider = new AnthropicProvider(providerConfig);

  const focusInstruction = focus
    ? `\n\nPay special attention to and preserve details about: ${focus}`
    : '';

  const summaryMessages: Message[] = [
    ...compactedForSummary,
    {
      id: uuidv4(),
      role: 'user',
      parts: [{ type: 'text', text: `Please summarize this conversation so I can continue working with a compressed context.${focusInstruction}` }],
      createdAt: Date.now(),
    },
  ];

  let summary = '';
  const stream = provider.stream(summaryMessages, [], SUMMARY_PROMPT);

  for await (const event of stream) {
    if (event.type === 'text-delta') {
      summary += event.delta;
    }
  }

  log.info('Compact summary generated, length:', summary.length);

  const replacementMessages: Message[] = [
    {
      id: uuidv4(),
      role: 'user',
      parts: [{
        type: 'text',
        text: `[Context Compact] The full conversation transcript has been saved to: ${transcriptPath}\n\nSummary of previous conversation:\n${summary}`,
      }],
      createdAt: Date.now(),
      hidden: true,
    },
    {
      id: uuidv4(),
      role: 'assistant',
      parts: [{ type: 'text', text: 'Understood. Continuing with the compressed context.' }],
      createdAt: Date.now(),
      hidden: true,
    },
  ];

  return { messages: replacementMessages, transcriptPath };
}

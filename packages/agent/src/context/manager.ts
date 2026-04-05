import type { ChatRequest, ProviderRegistry } from "@mineco/provider";

export type { CompressionStats } from "../types.js";

import type { SessionMessage } from "../session/types.js";
import type { CompressionStats } from "../types.js";
import { microCompact } from "./micro-compact.js";
import { type ExtractedNotes, extractSessionNotes } from "./session-memory.js";
import { estimateMessagesTokens } from "./token-estimator.js";

export interface ContextManagerConfig {
  /** Token threshold to trigger micro-compact (truncation + message removal) */
  microCompactThreshold: number;
  /** Minimum context tokens to initialize session memory extraction */
  sessionMemoryInitThreshold: number;
  /** Minimum token growth since last extraction to trigger an update */
  sessionMemoryUpdateTokens: number;
  /** Minimum tool calls since last extraction to trigger an update */
  sessionMemoryToolCalls: number;
  maxToolOutputChars: number;
  recentMessageCount: number;
  maxToolOutputTruncation: number;
}

export interface ContextManagerResult {
  messages: ChatRequest["messages"];
  systemPrompt: string;
  notes: ExtractedNotes | null;
  stats: CompressionStats;
}

export const DEFAULT_CONFIG: ContextManagerConfig = {
  microCompactThreshold: 50_000,
  sessionMemoryInitThreshold: 10_000,
  sessionMemoryUpdateTokens: 5_000,
  sessionMemoryToolCalls: 3,
  maxToolOutputChars: 2000,
  recentMessageCount: 10,
  maxToolOutputTruncation: 500,
};

interface SessionState {
  cachedNotes: ExtractedNotes | null;
  sessionMemoryInitialized: boolean;
  tokensAtLastExtraction: number;
  toolCallsAtLastExtraction: number;
}

export class ContextManager {
  private sessionStates = new Map<string, SessionState>();

  constructor(private config: ContextManagerConfig = DEFAULT_CONFIG) {}

  private getState(sessionId: string): SessionState {
    let state = this.sessionStates.get(sessionId);
    if (!state) {
      state = {
        cachedNotes: null,
        sessionMemoryInitialized: false,
        tokensAtLastExtraction: 0,
        toolCallsAtLastExtraction: 0,
      };
      this.sessionStates.set(sessionId, state);
    }
    return state;
  }

  async prepareContext(
    sessionId: string,
    sessionMessages: SessionMessage[],
    systemPrompt: string,
    requestDeps: {
      providerRegistry: ProviderRegistry;
      providerId: string;
      model: string;
    },
  ): Promise<ContextManagerResult> {
    const state = this.getState(sessionId);
    const apiMessages = toApiMessages(sessionMessages, systemPrompt);
    const tokenEstimate = estimateMessagesTokens(apiMessages);

    // --- Session memory extraction (independent of micro-compact) ---
    let notes = state.cachedNotes;
    let memoryExtracted = false;

    if (this.shouldExtractMemory(state, sessionMessages, tokenEstimate)) {
      const extracted = await extractSessionNotes(
        sessionMessages,
        requestDeps.providerRegistry,
        requestDeps.providerId,
        requestDeps.model,
      );
      if (extracted) {
        notes = extracted;
        memoryExtracted = true;
      }
      this.updateState(sessionId, {
        ...state,
        cachedNotes: extracted ?? state.cachedNotes,
        tokensAtLastExtraction: tokenEstimate,
        toolCallsAtLastExtraction: countToolCalls(sessionMessages),
        sessionMemoryInitialized: true,
      });
    }

    // --- Micro-compact (gated by high token threshold) ---
    let compactResult = {
      messages: apiMessages,
      wasCompressed: false,
      compressedTokenEstimate: tokenEstimate,
      stats: { toolOutputsTruncated: 0, messagesRemoved: 0 },
    };

    if (tokenEstimate >= this.config.microCompactThreshold) {
      compactResult = microCompact(apiMessages, {
        maxToolOutputChars: this.config.maxToolOutputChars,
        maxToolOutputTruncation: this.config.maxToolOutputTruncation,
        recentMessageCount: this.config.recentMessageCount,
        tokenBudget: this.config.microCompactThreshold,
      });
    }

    // Inject notes into system prompt
    const finalPrompt = notes
      ? injectNotesIntoPrompt(systemPrompt, notes)
      : systemPrompt;

    // Build final messages array without mutating compactResult
    const messages = compactResult.messages.map((msg, idx) =>
      idx === 0 && msg.role === "system"
        ? { ...msg, content: finalPrompt }
        : msg,
    );

    return {
      messages,
      systemPrompt: finalPrompt,
      notes,
      stats: {
        originalTokenEstimate: tokenEstimate,
        finalTokenEstimate: compactResult.compressedTokenEstimate,
        microCompacted: compactResult.wasCompressed,
        memoryExtracted,
        toolOutputsTruncated: compactResult.stats.toolOutputsTruncated,
        messagesRemoved: compactResult.stats.messagesRemoved,
      },
    };
  }

  private updateState(sessionId: string, state: SessionState): void {
    this.sessionStates.set(sessionId, state);
  }

  /**
   * Check if session memory should be extracted.
   * Matches Claude Code's shouldExtractMemory() logic:
   * - Init: first extraction requires tokenEstimate >= initThreshold
   * - Update: requires token growth >= updateTokens AND tool call growth >= toolCalls
   * - Also triggers at natural conversation breaks (no tool calls in last message + token threshold met)
   */
  private shouldExtractMemory(
    state: SessionState,
    messages: SessionMessage[],
    tokenEstimate: number,
  ): boolean {
    if (!state.sessionMemoryInitialized) {
      // First-time: check init threshold
      if (tokenEstimate < this.config.sessionMemoryInitThreshold) {
        return false;
      }
      return true;
    }

    // Subsequent: check token growth threshold
    const tokensSinceLastExtraction =
      tokenEstimate - state.tokensAtLastExtraction;
    const hasMetTokenThreshold =
      tokensSinceLastExtraction >= this.config.sessionMemoryUpdateTokens;

    if (!hasMetTokenThreshold) {
      return false;
    }

    // Check tool calls since last extraction (delta, not total)
    const totalToolCalls = countToolCalls(messages);
    const toolCallsSinceLast = totalToolCalls - state.toolCallsAtLastExtraction;
    const hasMetToolCallThreshold =
      toolCallsSinceLast >= this.config.sessionMemoryToolCalls;

    // Check if last message has no tool calls (natural conversation break)
    const lastMessage = messages[messages.length - 1];
    const hasToolCallsInLastTurn =
      lastMessage?.role === "assistant" &&
      lastMessage.toolCalls !== undefined &&
      lastMessage.toolCalls.length > 0;

    // Trigger when:
    // 1. Both thresholds met (tokens AND tool calls), OR
    // 2. No tool calls in last turn AND token threshold is met (natural break)
    return hasMetToolCallThreshold || !hasToolCallsInLastTurn;
  }
}

function toApiMessages(
  sessionMessages: SessionMessage[],
  systemPrompt: string,
): ChatRequest["messages"] {
  const result: ChatRequest["messages"] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of sessionMessages) {
    switch (msg.role) {
      case "user":
        result.push({ role: "user", content: msg.content });
        break;
      case "assistant":
        result.push({
          role: "assistant",
          content: msg.content,
          ...(msg.toolCalls ? { toolCalls: msg.toolCalls } : {}),
        });
        break;
      case "tool":
        result.push({
          role: "tool",
          content: msg.content,
          ...(msg.toolCallId ? { toolCallId: msg.toolCallId } : {}),
        });
        break;
    }
  }

  return result;
}

function countToolCalls(messages: SessionMessage[]): number {
  return messages.filter((m) => m.role === "tool").length;
}

export function injectNotesIntoPrompt(
  systemPrompt: string,
  notes: ExtractedNotes,
): string {
  const notesBlock = `
<session-notes>
# Session Context (auto-extracted)
- Project: ${notes.projectContext}
- Task Status: ${notes.currentTaskStatus}
- Key Decisions: ${notes.keyDecisions}
- Files: ${notes.filePaths.join(", ")}
- User Preferences: ${notes.userPreferences}
- Additional: ${notes.additionalContext}
</session-notes>`;

  if (systemPrompt.includes("</env>")) {
    return systemPrompt.replace("</env>", `</env>${notesBlock}`);
  }
  return systemPrompt + notesBlock;
}

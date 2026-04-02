import type { ChatRequest, ProviderRegistry } from "@mineco/provider";
export type { CompressionStats } from "../types.js";
import type { CompressionStats } from "../types.js";
import type { SessionMessage } from "../session/types.js";
import { microCompact } from "./micro-compact.js";
import {
  extractSessionNotes,
  type ExtractedNotes,
} from "./session-memory.js";
import { estimateMessagesTokens } from "./token-estimator.js";

export interface ContextManagerConfig {
  microCompactThreshold: number;
  sessionMemoryThreshold: number;
  toolCallThreshold: number;
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
  sessionMemoryThreshold: 50_000,
  toolCallThreshold: 10,
  maxToolOutputChars: 2000,
  recentMessageCount: 10,
  maxToolOutputTruncation: 500,
};

interface SessionState {
  cachedNotes: ExtractedNotes | null;
  notesExtracted: boolean;
}

export class ContextManager {
  private sessionStates = new Map<string, SessionState>();

  constructor(
    private config: ContextManagerConfig = DEFAULT_CONFIG,
  ) {}

  private getState(sessionId: string): SessionState {
    let state = this.sessionStates.get(sessionId);
    if (!state) {
      state = { cachedNotes: null, notesExtracted: false };
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

    if (tokenEstimate < this.config.microCompactThreshold) {
      return {
        messages: apiMessages,
        systemPrompt,
        notes: state.cachedNotes,
        stats: {
          originalTokenEstimate: tokenEstimate,
          finalTokenEstimate: tokenEstimate,
          microCompacted: false,
          memoryExtracted: false,
          toolOutputsTruncated: 0,
          messagesRemoved: 0,
        },
      };
    }

    // Layer 1: Micro-compact
    const compactResult = microCompact(apiMessages, {
      maxToolOutputChars: this.config.maxToolOutputChars,
      maxToolOutputTruncation: this.config.maxToolOutputTruncation,
      recentMessageCount: this.config.recentMessageCount,
      tokenBudget: this.config.microCompactThreshold,
    });

    // Layer 2: Session memory extraction
    let notes = state.cachedNotes;
    let memoryExtracted = false;

    if (
      !state.notesExtracted &&
      tokenEstimate >= this.config.sessionMemoryThreshold &&
      countToolCalls(sessionMessages) >= this.config.toolCallThreshold
    ) {
      const extracted = await extractSessionNotes(
        sessionMessages,
        requestDeps.providerRegistry,
        requestDeps.providerId,
        requestDeps.model,
      );
      if (extracted) {
        notes = extracted;
        state.cachedNotes = extracted;
        memoryExtracted = true;
      }
      state.notesExtracted = true;
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

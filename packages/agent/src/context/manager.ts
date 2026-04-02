import type { ChatRequest, ProviderRegistry } from "@mineco/provider";
import type { CompressionStats } from "../types.js";
import type { SessionMessage } from "../session/types.js";
import { microCompact } from "./micro-compact.js";
import {
  extractSessionNotes,
  type ExtractedNotes,
} from "./session-memory.js";
import { estimateSessionTokens } from "./token-estimator.js";

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

export class ContextManager {
  private cachedNotes: ExtractedNotes | null = null;
  private notesExtracted = false;

  constructor(
    private config: ContextManagerConfig = DEFAULT_CONFIG,
    private deps?: {
      providerRegistry: ProviderRegistry;
      providerId: string;
      model: string;
    },
  ) {}

  async prepareContext(
    sessionMessages: SessionMessage[],
    systemPrompt: string,
    requestDeps?: {
      providerRegistry: ProviderRegistry;
      providerId: string;
      model: string;
    },
  ): Promise<ContextManagerResult> {
    const deps = requestDeps ?? this.deps;
    const tokenEstimate = estimateSessionTokens(sessionMessages, systemPrompt);
    const apiMessages = toApiMessages(sessionMessages, systemPrompt);

    if (tokenEstimate < this.config.microCompactThreshold) {
      return {
        messages: apiMessages,
        systemPrompt,
        notes: this.cachedNotes,
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
    let notes = this.cachedNotes;
    let memoryExtracted = false;

    if (
      deps &&
      !this.notesExtracted &&
      tokenEstimate >= this.config.sessionMemoryThreshold &&
      countToolCalls(sessionMessages) >= this.config.toolCallThreshold
    ) {
      const extracted = await extractSessionNotes(
        sessionMessages,
        deps.providerRegistry,
        deps.providerId,
        deps.model,
      );
      if (extracted) {
        notes = extracted;
        this.cachedNotes = extracted;
        memoryExtracted = true;
      }
      this.notesExtracted = true;
    }

    // Inject notes into system prompt
    const finalPrompt = notes
      ? injectNotesIntoPrompt(systemPrompt, notes)
      : systemPrompt;

    const messages = compactResult.messages;
    if (messages.length > 0 && messages[0].role === "system") {
      messages[0] = { ...messages[0], content: finalPrompt };
    }

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

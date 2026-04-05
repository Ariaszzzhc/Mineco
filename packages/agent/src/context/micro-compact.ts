import type { Message } from "@mineco/provider";
import { estimateMessagesTokens } from "./token-estimator.js";

export interface MicroCompactOptions {
  maxToolOutputChars: number;
  maxToolOutputTruncation: number;
  recentMessageCount: number;
  tokenBudget: number;
}

export interface CompactStats {
  toolOutputsTruncated: number;
  messagesRemoved: number;
}

export interface CompactResult {
  messages: Message[];
  wasCompressed: boolean;
  compressedTokenEstimate: number;
  stats: CompactStats;
}

const DEFAULT_OPTIONS: MicroCompactOptions = {
  maxToolOutputChars: 2000,
  maxToolOutputTruncation: 500,
  recentMessageCount: 10,
  tokenBudget: 50_000,
};

export function microCompact(
  messages: Message[],
  options: Partial<MicroCompactOptions> = {},
): CompactResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const originalEstimate = estimateMessagesTokens(messages);

  if (originalEstimate < opts.tokenBudget) {
    return {
      messages,
      wasCompressed: false,
      compressedTokenEstimate: originalEstimate,
      stats: { toolOutputsTruncated: 0, messagesRemoved: 0 },
    };
  }

  let result = [...messages];
  let toolOutputsTruncated = 0;
  let messagesRemoved = 0;

  // Pass 1: Truncate long tool outputs
  const truncated: Message[] = [];
  for (const msg of result) {
    if (msg.role === "tool" && typeof msg.content === "string") {
      if (msg.content.includes("<skill-content")) {
        truncated.push(msg);
        continue;
      }
      if (msg.content.length > opts.maxToolOutputChars) {
        const kept = msg.content.slice(0, opts.maxToolOutputTruncation);
        truncated.push({
          ...msg,
          content: `${kept}\n... [truncated from ${msg.content.length} chars]`,
        });
        toolOutputsTruncated++;
        continue;
      }
    }
    truncated.push(msg);
  }
  result = truncated;

  // Pass 2: Remove old assistant+tool pairs from middle if still over budget
  const estimate = estimateMessagesTokens(result);
  if (estimate >= opts.tokenBudget) {
    const recentStart = Math.max(0, result.length - opts.recentMessageCount);

    // Build set of indices to preserve: system, all user messages, recent messages
    const preservedIndices = new Set<number>();
    for (let i = 0; i < result.length; i++) {
      const msg = result[i];
      if (!msg) continue;
      if (msg.role === "system") preservedIndices.add(i);
      if (msg.role === "user") preservedIndices.add(i);
      if (i >= recentStart) preservedIndices.add(i);
      if (
        msg.role === "tool" &&
        typeof msg.content === "string" &&
        msg.content.includes("<skill-content")
      ) {
        preservedIndices.add(i);
      }
    }

    // Remove oldest assistant+tool blocks not in preserved set
    const filtered: Message[] = [];
    let i = 0;
    while (i < result.length) {
      const msg = result[i];
      if (!msg) {
        i++;
        continue;
      }
      if (preservedIndices.has(i)) {
        filtered.push(msg);
        i++;
        continue;
      }

      // Skip removable assistant+tool block
      if (msg.role === "assistant") {
        let j = i + 1;
        while (j < result.length) {
          const nextMsg = result[j];
          if (!nextMsg || nextMsg.role !== "tool" || preservedIndices.has(j))
            break;
          j++;
        }
        // Only remove the block if we won't break chain into preserved tail
        if (j <= recentStart || preservedIndices.has(j)) {
          messagesRemoved += j - i;
          i = j;
          continue;
        }
      }

      filtered.push(msg);
      i++;
    }

    result = filtered;
  }

  const compressedEstimate = estimateMessagesTokens(result);

  return {
    messages: result,
    wasCompressed: true,
    compressedTokenEstimate: compressedEstimate,
    stats: { toolOutputsTruncated, messagesRemoved },
  };
}

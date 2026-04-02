import type { Message } from "@mineco/provider";
import type { SessionMessage } from "../session/types.js";

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

const MESSAGE_OVERHEAD = 4;

export function estimateMessageTokens(msg: Message): number {
  let tokens = MESSAGE_OVERHEAD;

  if (typeof msg.content === "string") {
    tokens += estimateTokens(msg.content);
  }

  if (msg.toolCalls) {
    tokens += estimateTokens(JSON.stringify(msg.toolCalls));
  }

  if (msg.toolCallId) {
    tokens += estimateTokens(msg.toolCallId);
  }

  return tokens;
}

export function estimateMessagesTokens(messages: Message[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

export function estimateSessionTokens(
  messages: SessionMessage[],
  systemPrompt: string,
): number {
  const systemTokens = estimateTokens(systemPrompt);
  const messageTokens = messages.reduce((sum, msg) => {
    let tokens = MESSAGE_OVERHEAD;
    tokens += estimateTokens(msg.content);
    if (msg.thinking) tokens += estimateTokens(msg.thinking);
    if (msg.toolCalls) tokens += estimateTokens(JSON.stringify(msg.toolCalls));
    if (msg.toolCallId) tokens += estimateTokens(msg.toolCallId);
    if (msg.toolName) tokens += estimateTokens(msg.toolName);
    return sum + tokens;
  }, 0);
  return systemTokens + messageTokens;
}

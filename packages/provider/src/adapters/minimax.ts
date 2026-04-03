import type { ChatRequest, ChatResponse, ChatStreamChunk, ModelInfo } from "../types.js";
import type { SubscriptionClient } from "../usage/subscription.js";
import { MiniMaxSubscriptionClient } from "../usage/minimax-subscription.js";
import { OpenAICompatAdapter } from "./openai-compat.js";

export type MiniMaxPlatform = "cn" | "intl";

export interface MiniMaxConfig {
  apiKey: string;
  /** Domestic ("cn") or international ("intl"). Default: "intl" */
  platform?: MiniMaxPlatform;
  /** Optional cookie for token plan API (e.g. "HERTZ-SESSION=xxx") */
  cookie?: string;
}

const PLATFORM_URLS: Record<MiniMaxPlatform, string> = {
  intl: "https://api.minimax.io/v1",
  cn: "https://api.minimaxi.com/v1",
};

const MINIMAX_MODELS: ModelInfo[] = [
  // Flagship — recursive self-improvement
  {
    id: "MiniMax-M2.7",
    name: "MiniMax M2.7",
    maxOutputTokens: 131072,
    contextWindow: 204800,
    supportsVision: false,
    supportsToolCalling: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.3, outputPerMillion: 1.2 },
  },
  {
    id: "MiniMax-M2.7-highspeed",
    name: "M2.7 Highspeed",
    maxOutputTokens: 131072,
    contextWindow: 204800,
    supportsVision: false,
    supportsToolCalling: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.6, outputPerMillion: 2.4 },
  },
  // High performance — real-world productivity
  {
    id: "MiniMax-M2.5",
    name: "MiniMax M2.5",
    maxOutputTokens: 131072,
    contextWindow: 204800,
    supportsVision: false,
    supportsToolCalling: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.3, outputPerMillion: 1.2 },
  },
  {
    id: "MiniMax-M2.5-highspeed",
    name: "M2.5 Highspeed",
    maxOutputTokens: 131072,
    contextWindow: 204800,
    supportsVision: false,
    supportsToolCalling: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.6, outputPerMillion: 2.4 },
  },
  // Multi-language programming
  {
    id: "MiniMax-M2.1",
    name: "MiniMax M2.1",
    maxOutputTokens: 131072,
    contextWindow: 204800,
    supportsVision: false,
    supportsToolCalling: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.3, outputPerMillion: 1.2 },
  },
  {
    id: "MiniMax-M2.1-highspeed",
    name: "M2.1 Highspeed",
    maxOutputTokens: 131072,
    contextWindow: 204800,
    supportsVision: false,
    supportsToolCalling: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.6, outputPerMillion: 2.4 },
  },
  // Agentic — coding & reasoning
  {
    id: "MiniMax-M2",
    name: "MiniMax M2",
    maxOutputTokens: 131072,
    contextWindow: 204800,
    supportsVision: false,
    supportsToolCalling: true,
    supportsStreaming: true,
    pricing: { inputPerMillion: 0.3, outputPerMillion: 1.2 },
  },
];

export class MiniMaxProvider extends OpenAICompatAdapter {
  readonly subscription: SubscriptionClient;
  private reasoningBuffer = "";

  constructor(config: string | MiniMaxConfig) {
    const resolved = typeof config === "string" ? { apiKey: config } : config;
    const platform = resolved.platform ?? "intl";
    const baseURL = PLATFORM_URLS[platform];

    super({
      id: "minimax",
      name: "MiniMax",
      baseURL,
      headers: { Authorization: `Bearer ${resolved.apiKey}` },
      models: MINIMAX_MODELS,
    });

    const domain = baseURL.replace(/\/v1$/, "");
    this.subscription = new MiniMaxSubscriptionClient(
      resolved.apiKey,
      domain,
      resolved.cookie,
    );
  }

  protected override transformRequest(req: ChatRequest): unknown {
    const body = super.transformRequest(req) as Record<string, unknown>;
    body.reasoning_split = true;
    return body;
  }

  protected override transformResponse(raw: unknown): ChatResponse {
    const data = raw as Record<string, unknown>;
    const choices = data.choices as Array<Record<string, unknown>>;
    const choice = choices[0] as Record<string, unknown>;
    const message = choice.message as Record<string, unknown>;

    // Extract reasoning_details thinking content
    const reasoningDetails = message.reasoning_details as
      | Array<Record<string, unknown>>
      | undefined;
    const thinkingText = reasoningDetails?.[0]?.text as string | undefined;

    // Build content: prepend thinking if present
    const content = (message.content as string) ?? "";
    const finalContent = thinkingText
      ? `<thinking>\n${thinkingText}\n</thinking>\n\n${content}`
      : content;

    const finishReason = (choice.finish_reason as ChatResponse["finishReason"]) ?? "stop";
    const toolCalls = message.tool_calls as
      | Array<Record<string, unknown>>
      | undefined;

    return {
      id: data.id as string,
      model: data.model as string,
      message: {
        role: (message.role as "assistant") ?? "assistant",
        content: finalContent,
        ...(toolCalls
          ? {
              toolCalls: toolCalls.map((tc) => {
                const fn = tc.function as Record<string, unknown>;
                return {
                  id: tc.id as string,
                  name: fn.name as string,
                  arguments: fn.arguments as string,
                };
              }),
            }
          : {}),
      },
      usage: {
        promptTokens: (data.usage as Record<string, unknown>)?.prompt_tokens as number ?? 0,
        completionTokens: (data.usage as Record<string, unknown>)?.completion_tokens as number ?? 0,
        totalTokens: (data.usage as Record<string, unknown>)?.total_tokens as number ?? 0,
      },
      finishReason,
    };
  }

  protected override transformStreamChunk(
    raw: unknown,
  ): ChatStreamChunk | null {
    const data = raw as Record<string, unknown>;
    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    if (!choices || choices.length === 0) return null;

    const choice = choices[0] as Record<string, unknown>;
    const delta = choice.delta as Record<string, unknown> | undefined;
    if (!delta) return null;

    const result: ChatStreamChunk = {
      delta: {},
      finishReason: (choice.finish_reason as ChatStreamChunk["finishReason"]) ?? null,
    };

    if (typeof delta.content === "string") {
      result.delta.content = delta.content;
    }

    // Handle reasoning_details (cumulative buffer)
    const reasoningDetails = delta.reasoning_details as
      | Array<Record<string, unknown>>
      | undefined;
    if (reasoningDetails?.[0]?.text) {
      const fullText = reasoningDetails[0].text as string;
      const newContent = fullText.slice(this.reasoningBuffer.length);
      this.reasoningBuffer = fullText;
      if (newContent) {
        result.delta.thinking = newContent;
      }
    }

    // Reset buffer on stream end
    if (result.finishReason) {
      this.reasoningBuffer = "";
    }

    // Handle tool calls (same format as OpenAI)
    const rawToolCalls = delta.tool_calls as
      | Array<Record<string, unknown>>
      | undefined;
    if (rawToolCalls) {
      result.delta.toolCalls = rawToolCalls.map((tc, index) => {
        const fn = tc.function as Record<string, unknown> | undefined;
        return {
          index: (tc.index as number) ?? index,
          ...(tc.id != null ? { id: tc.id as string } : {}),
          ...(fn?.name != null ? { name: fn.name as string } : {}),
          ...(fn?.arguments != null ? { arguments: fn.arguments as string } : {}),
        };
      });
    }

    if (data.usage) {
      const u = data.usage as Record<string, unknown>;
      result.usage = {
        promptTokens: (u.prompt_tokens as number) ?? 0,
        completionTokens: (u.completion_tokens as number) ?? 0,
        totalTokens: (u.total_tokens as number) ?? 0,
      };
    }

    return result;
  }
}

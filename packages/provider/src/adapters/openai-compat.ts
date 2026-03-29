import type {
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  FinishReason,
  Message,
  MessageContent,
  ModelInfo,
  Tool,
  ToolCall,
  Usage,
} from "../types.js";
import { BaseAdapter } from "../adapter.js";

function toProviderMessage(msg: Message): unknown {
  const result: Record<string, unknown> = {
    role: msg.role,
    content: toProviderContent(msg.content),
  };

  if (msg.toolCalls) {
    result["tool_calls"] = msg.toolCalls.map((tc) => ({
      id: tc.id,
      type: "function",
      function: { name: tc.name, arguments: tc.arguments },
    }));
  }

  if (msg.toolCallId) {
    result["tool_call_id"] = msg.toolCallId;
  }

  return result;
}

function toProviderContent(content: MessageContent): unknown {
  if (typeof content === "string") return content;

  return content.map((part) => {
    if (part.type === "text") {
      return { type: "text", text: part.text };
    }
    return { type: "image_url", image_url: { url: part.image } };
  });
}

function toProviderTools(tools: Tool[]): unknown[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function parseUsage(raw: unknown): Usage {
  const u = raw as Record<string, unknown>;
  return {
    promptTokens: (u["prompt_tokens"] as number) ?? 0,
    completionTokens: (u["completion_tokens"] as number) ?? 0,
    totalTokens: (u["total_tokens"] as number) ?? 0,
  };
}

function parseToolCalls(raw: unknown): ToolCall[] {
  const calls = raw as Array<Record<string, unknown>>;
  return calls.map((tc) => {
    const fn = tc["function"] as Record<string, unknown>;
    return {
      id: tc["id"] as string,
      name: fn["name"] as string,
      arguments: fn["arguments"] as string,
    };
  });
}

function parseMessage(raw: unknown): Message {
  const m = raw as Record<string, unknown>;
  const rawToolCalls = m["tool_calls"] as
    | Array<Record<string, unknown>>
    | undefined;

  return {
    role: (m["role"] as Message["role"]) ?? "assistant",
    content: (m["content"] as MessageContent) ?? "",
    ...(rawToolCalls ? { toolCalls: parseToolCalls(rawToolCalls) } : {}),
  };
}

export class OpenAICompatAdapter extends BaseAdapter {
  readonly id: string;
  readonly name: string;

  private readonly baseURL: string;
  private readonly headers: Record<string, string>;
  private readonly modelDefinitions: ModelInfo[];

  constructor(config: {
    id: string;
    name: string;
    baseURL: string;
    headers: Record<string, string>;
    models: ModelInfo[];
  }) {
    super();
    this.id = config.id;
    this.name = config.name;
    this.baseURL = config.baseURL;
    this.headers = config.headers;
    this.modelDefinitions = config.models;
  }

  protected override getBaseURL(): string {
    return this.baseURL;
  }

  protected override getHeaders(): Record<string, string> {
    return this.headers;
  }

  override listModels(): ModelInfo[] {
    return this.modelDefinitions;
  }

  protected override transformRequest(req: ChatRequest): unknown {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: req.messages.map(toProviderMessage),
    };

    if (req.tools) {
      body["tools"] = toProviderTools(req.tools);
    }
    if (req.temperature !== undefined) {
      body["temperature"] = req.temperature;
    }
    if (req.maxTokens !== undefined) {
      body["max_tokens"] = req.maxTokens;
    }
    if (req.stream !== undefined) {
      body["stream"] = req.stream;
    }

    return body;
  }

  protected override transformResponse(raw: unknown): ChatResponse {
    const data = raw as Record<string, unknown>;
    const choices = data["choices"] as Array<Record<string, unknown>>;
    const choice = choices[0] as Record<string, unknown>;
    const message = parseMessage(choice["message"]);
    const finishReason = (choice["finish_reason"] as FinishReason) ?? "stop";

    return {
      id: data["id"] as string,
      model: data["model"] as string,
      message,
      usage: parseUsage(data["usage"]),
      finishReason,
    };
  }

  protected override transformStreamChunk(
    raw: unknown,
  ): ChatStreamChunk | null {
    const data = raw as Record<string, unknown>;
    const choices = data["choices"] as
      | Array<Record<string, unknown>>
      | undefined;
    if (!choices || choices.length === 0) return null;

    const choice = choices[0] as Record<string, unknown>;
    const delta = choice["delta"] as Record<string, unknown> | undefined;
    if (!delta) return null;

    const result: ChatStreamChunk = {
      delta: {},
      finishReason: (choice["finish_reason"] as FinishReason | null) ?? null,
    };

    if (typeof delta["content"] === "string") {
      result.delta.content = delta["content"];
    }

    const rawToolCalls = delta["tool_calls"] as
      | Array<Record<string, unknown>>
      | undefined;
    if (rawToolCalls) {
      result.delta.toolCalls = rawToolCalls.map((tc, index) => {
        const fn = tc["function"] as Record<string, unknown> | undefined;
        return {
          index: (tc["index"] as number) ?? index,
          ...(tc["id"] != null ? { id: tc["id"] as string } : {}),
          ...(fn?.["name"] != null ? { name: fn["name"] as string } : {}),
          ...(fn?.["arguments"] != null
            ? { arguments: fn["arguments"] as string }
            : {}),
        };
      });
    }

    if (data["usage"]) {
      result.usage = parseUsage(data["usage"]);
    }

    return result;
  }
}

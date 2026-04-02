export type FinishReason = "stop" | "tool_calls" | "length";

export type MessageRole = "system" | "user" | "assistant" | "tool";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: string };

export type MessageContent = string | ContentPart[];

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface Message {
  role: MessageRole;
  content: MessageContent;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatRequest {
  model: string;
  messages: Message[];
  tools?: Tool[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  providerOptions?: Record<string, unknown>;
}

export interface ChatResponse {
  id: string;
  model: string;
  message: Message;
  usage: Usage;
  finishReason: FinishReason;
}

export interface ChatStreamChunk {
  delta: {
    content?: string;
    thinking?: string;
    toolCalls?: Array<{ index: number } & Partial<ToolCall>>;
  };
  usage?: Usage;
  finishReason: FinishReason | null;
}

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  maxOutputTokens: number;
  contextWindow: number;
  supportsVision: boolean;
  supportsToolCalling: boolean;
  supportsStreaming: boolean;
  pricing?: ModelPricing;
}

export interface UserProviderConfig {
  id: string;
  type: "openai-compatible";
  baseURL: string;
  apiKey?: string;
  headers?: Record<string, string>;
  models: Array<{
    id: string;
    name: string;
    maxOutputTokens?: number;
    contextWindow?: number;
    supportsToolCalling?: boolean;
    supportsVision?: boolean;
    pricing?: ModelPricing;
  }>;
}

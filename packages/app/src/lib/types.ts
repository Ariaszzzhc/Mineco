// Mirrors @mineco/agent types

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface SessionMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  usage?: Usage;
  createdAt: number;
}

export interface Session {
  id: string;
  title: string;
  messages: SessionMessage[];
  createdAt: number;
  updatedAt: number;
}

// Mirrors @mineco/core config types

export interface ZhipuProviderConfig {
  type: "zhipu";
  apiKey: string;
  platform: "cn" | "intl";
  endpoint: "general" | "coding";
}

export interface OpenAICompatProviderConfig {
  type: "openai-compatible";
  id: string;
  baseURL: string;
  apiKey?: string;
  headers?: Record<string, string>;
  models: Array<{ id: string; name: string }>;
}

export type ProviderConfig = ZhipuProviderConfig | OpenAICompatProviderConfig;

export interface AppSettings {
  defaultProvider?: string;
  defaultModel?: string;
}

export interface AppConfig {
  providers: ProviderConfig[];
  settings: AppSettings;
}

// SSE event types (mirrors @mineco/agent AgentEvent)

export type TextDeltaEvent = { type: "text-delta"; delta: string };
export type ToolCallEvent = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
};
export type ToolResultEvent = {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  result: string;
  isError: boolean;
};
export type UsageEvent = { type: "usage"; usage: Usage };
export type StepEvent = { type: "step"; step: number; maxSteps: number };
export type CompleteEvent = {
  type: "complete";
  reason: "stop" | "max-steps" | "aborted";
};
export type ErrorEvent = { type: "error"; error: string };

export type AgentEvent =
  | TextDeltaEvent
  | ToolCallEvent
  | ToolResultEvent
  | UsageEvent
  | StepEvent
  | CompleteEvent
  | ErrorEvent;

// Types inferred from Hono RPC client — aligned with exactOptionalPropertyTypes

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
  thinking?: string | undefined;
  toolCalls?: ToolCall[] | undefined;
  toolCallId?: string | undefined;
  toolName?: string | undefined;
  isError?: boolean | undefined;
  usage?: Usage | undefined;
  createdAt: number;
}

export interface Session {
  id: string;
  title: string;
  workspaceId: string;
  messages: SessionMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface Workspace {
  id: string;
  path: string;
  name: string;
  lastOpenedAt: number;
  createdAt: number;
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
  apiKey?: string | undefined;
  headers?: Record<string, string> | undefined;
  models: Array<{ id: string; name: string }>;
}

export type ProviderConfig = ZhipuProviderConfig | OpenAICompatProviderConfig;

export interface AppSettings {
  defaultProvider?: string | undefined;
  defaultModel?: string | undefined;
}

export interface AppConfig {
  providers: ProviderConfig[];
  settings: AppSettings;
}

// SSE event types (mirrors @mineco/agent AgentEvent)

export type TextDeltaEvent = { type: "text-delta"; delta: string };
export type ThinkingDeltaEvent = { type: "thinking-delta"; delta: string };
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
  | ThinkingDeltaEvent
  | ToolCallEvent
  | ToolResultEvent
  | UsageEvent
  | StepEvent
  | CompleteEvent
  | ErrorEvent;

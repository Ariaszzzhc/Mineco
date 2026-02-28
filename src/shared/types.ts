// Core message types shared between main and renderer processes

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolResultPart {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}

export type Part = TextPart | ToolCallPart | ToolResultPart;

export interface UserMessage {
  id: string;
  role: 'user';
  parts: Part[];
  createdAt: number;
}

export interface AssistantMessage {
  id: string;
  role: 'assistant';
  parts: Part[];
  createdAt: number;
}

export type Message = UserMessage | AssistantMessage;

export interface Session {
  id: string;
  title: string;
  messages: Message[];
  workingDir: string | null;
  createdAt: number;
  updatedAt: number;
}

// Stream events for IPC communication
export type StreamEventType =
  | 'text-delta'
  | 'tool-call'
  | 'tool-result'
  | 'message-start'
  | 'message-continue'
  | 'message-complete'
  | 'error';

export interface StreamEvent {
  type: StreamEventType;
  sessionId: string;
  messageId: string;
  // For text-delta
  delta?: string;
  // For tool-call
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  // For tool-result
  result?: unknown;
  isError?: boolean;
  // For error
  error?: string;
}

// Provider configuration
export interface ProviderConfig {
  type: 'anthropic-compatible' | 'openai-compatible';
  name: string;
  apiKey: string;
  baseURL: string;
  model: string;
}

// App configuration
export interface AppConfig {
  providers: ProviderConfig[];
  defaultProvider: string;
  theme: 'light' | 'dark' | 'system';
}

export const DEFAULT_CONFIG: AppConfig = {
  providers: [],
  defaultProvider: '',
  theme: 'system',
};

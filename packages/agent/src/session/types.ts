import type { ToolCall, Usage } from "@mineco/provider";

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

export interface SessionStore {
  create(): Promise<Session>;
  get(id: string): Promise<Session | undefined>;
  list(): Promise<Session[]>;
  addMessage(sessionId: string, msg: SessionMessage): Promise<void>;
  updateMessages(
    sessionId: string,
    messages: SessionMessage[],
  ): Promise<void>;
  delete(id: string): Promise<void>;
}

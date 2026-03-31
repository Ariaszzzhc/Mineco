import type { ToolCall, Usage } from "@mineco/provider";

export interface SessionMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  thinking?: string;
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
  workspaceId: string;
  messages: SessionMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface SessionStore {
  create(workspaceId: string): Promise<Session>;
  get(id: string): Promise<Session | undefined>;
  list(): Promise<Session[]>;
  listByWorkspace(workspaceId: string): Promise<Session[]>;
  addMessage(sessionId: string, msg: SessionMessage): Promise<void>;
  updateMessages(sessionId: string, messages: SessionMessage[]): Promise<void>;
  delete(id: string): Promise<void>;
}

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
  runId?: string;
  createdAt: number;
}

export interface Session {
  id: string;
  title: string;
  workspaceId: string;
  worktreePath: string | null;
  worktreeBranch: string | null;
  messages: SessionMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface SubagentRun {
  id: string;
  sessionId: string;
  parentToolCallId: string;
  agentType: string;
  status: "running" | "completed" | "error";
  summary: string | null;
  createdAt: number;
  completedAt: number | null;
}

export interface SessionStore {
  create(
    workspaceId: string,
    options?: { mode?: "regular" | "worktree"; branchName?: string },
  ): Promise<Session>;
  get(id: string): Promise<Session | undefined>;
  list(): Promise<Session[]>;
  listByWorkspace(workspaceId: string): Promise<Session[]>;
  addMessage(sessionId: string, msg: SessionMessage): Promise<void>;
  updateMessages(sessionId: string, messages: SessionMessage[]): Promise<void>;
  updateTitle(id: string, title: string): Promise<void>;
  delete(id: string): Promise<void>;
  hasUncommittedChanges(id: string): Promise<boolean>;
  createRun(run: SubagentRun): Promise<void>;
  updateRun(
    runId: string,
    updates: Partial<Pick<SubagentRun, "status" | "summary" | "completedAt">>,
  ): Promise<void>;
  getRunsBySession(sessionId: string): Promise<SubagentRun[]>;
}

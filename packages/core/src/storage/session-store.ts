import { randomUUID } from "node:crypto";
import type {
  Session,
  SessionMessage,
  SessionStore,
  SubagentRun,
} from "@mineco/agent";
import type { ToolCall, Usage } from "@mineco/provider";
import type { Kysely } from "kysely";
import type { Database } from "./schema.js";

export class SqliteSessionStore implements SessionStore {
  constructor(private db: Kysely<Database>) {}

  async create(workspaceId: string): Promise<Session> {
    const now = Date.now();
    const id = randomUUID();

    await this.db
      .insertInto("sessions")
      .values({
        id,
        title: "New Session",
        workspace_id: workspaceId,
        created_at: now,
        updated_at: now,
      })
      .execute();

    return {
      id,
      title: "New Session",
      workspaceId,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  async get(id: string): Promise<Session | undefined> {
    const session = await this.db
      .selectFrom("sessions")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!session) return undefined;

    const rows = await this.db
      .selectFrom("messages")
      .selectAll()
      .where("session_id", "=", id)
      .orderBy("created_at", "asc")
      .execute();

    return {
      id: session.id,
      title: session.title,
      workspaceId: session.workspace_id,
      messages: rows.map(rowToMessage),
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    };
  }

  async list(): Promise<Session[]> {
    const sessions = await this.db
      .selectFrom("sessions")
      .selectAll()
      .orderBy("updated_at", "desc")
      .execute();

    return sessions.map((s) => ({
      id: s.id,
      title: s.title,
      workspaceId: s.workspace_id,
      messages: [],
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    }));
  }

  async listByWorkspace(workspaceId: string): Promise<Session[]> {
    const sessions = await this.db
      .selectFrom("sessions")
      .selectAll()
      .where("workspace_id", "=", workspaceId)
      .orderBy("updated_at", "desc")
      .execute();

    return sessions.map((s) => ({
      id: s.id,
      title: s.title,
      workspaceId: s.workspace_id,
      messages: [],
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    }));
  }

  async addMessage(sessionId: string, msg: SessionMessage): Promise<void> {
    await this.db
      .insertInto("messages")
      .values({
        id: msg.id,
        session_id: sessionId,
        role: msg.role,
        content: msg.content,
        thinking: msg.thinking ?? null,
        tool_calls: msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
        tool_call_id: msg.toolCallId ?? null,
        tool_name: msg.toolName ?? null,
        is_error: msg.isError ? 1 : 0,
        usage: msg.usage ? JSON.stringify(msg.usage) : null,
        run_id: msg.runId ?? null,
        created_at: msg.createdAt,
      })
      .execute();

    await this.db
      .updateTable("sessions")
      .set({ updated_at: Date.now() })
      .where("id", "=", sessionId)
      .execute();
  }

  async updateMessages(
    sessionId: string,
    messages: SessionMessage[],
  ): Promise<void> {
    await this.db
      .deleteFrom("messages")
      .where("session_id", "=", sessionId)
      .execute();

    if (messages.length > 0) {
      await this.db
        .insertInto("messages")
        .values(
          messages.map((msg) => ({
            id: msg.id,
            session_id: sessionId,
            role: msg.role,
            content: msg.content,
            tool_calls: msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
            tool_call_id: msg.toolCallId ?? null,
            tool_name: msg.toolName ?? null,
            is_error: msg.isError ? 1 : 0,
            usage: msg.usage ? JSON.stringify(msg.usage) : null,
            run_id: msg.runId ?? null,
            created_at: msg.createdAt,
          })),
        )
        .execute();
    }

    await this.db
      .updateTable("sessions")
      .set({ updated_at: Date.now() })
      .where("id", "=", sessionId)
      .execute();
  }

  async updateTitle(id: string, title: string): Promise<void> {
    await this.db
      .updateTable("sessions")
      .set({ title, updated_at: Date.now() })
      .where("id", "=", id)
      .execute();
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom("messages").where("session_id", "=", id).execute();
    await this.db.deleteFrom("sessions").where("id", "=", id).execute();
  }

  async createRun(run: SubagentRun): Promise<void> {
    await this.db
      .insertInto("runs")
      .values({
        id: run.id,
        session_id: run.sessionId,
        parent_tool_call_id: run.parentToolCallId,
        agent_type: run.agentType,
        status: run.status,
        summary: run.summary ?? null,
        created_at: run.createdAt,
        completed_at: run.completedAt ?? null,
      })
      .execute();
  }

  async updateRun(
    runId: string,
    updates: Partial<Pick<SubagentRun, "status" | "summary" | "completedAt">>,
  ): Promise<void> {
    await this.db
      .updateTable("runs")
      .set({
        ...(updates.status !== undefined ? { status: updates.status } : {}),
        ...(updates.summary !== undefined ? { summary: updates.summary } : {}),
        ...(updates.completedAt !== undefined
          ? { completed_at: updates.completedAt }
          : {}),
      })
      .where("id", "=", runId)
      .execute();
  }

  async getRunsBySession(sessionId: string): Promise<SubagentRun[]> {
    const rows = await this.db
      .selectFrom("runs")
      .selectAll()
      .where("session_id", "=", sessionId)
      .orderBy("created_at", "asc")
      .execute();

    return rows.map(rowToRun);
  }
}

function rowToRun(row: Database["runs"]): SubagentRun {
  return {
    id: row.id,
    sessionId: row.session_id,
    parentToolCallId: row.parent_tool_call_id,
    agentType: row.agent_type,
    status: row.status as SubagentRun["status"],
    summary: row.summary,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function rowToMessage(row: Database["messages"]): SessionMessage {
  return {
    id: row.id as string,
    role: row.role as "user" | "assistant" | "tool",
    content: row.content as string,
    ...(row.thinking ? { thinking: row.thinking as string } : {}),
    ...(row.tool_calls
      ? { toolCalls: JSON.parse(row.tool_calls as string) as ToolCall[] }
      : {}),
    ...(row.tool_call_id ? { toolCallId: row.tool_call_id as string } : {}),
    ...(row.tool_name ? { toolName: row.tool_name as string } : {}),
    ...(row.is_error ? { isError: true } : {}),
    ...(row.usage ? { usage: JSON.parse(row.usage as string) as Usage } : {}),
    ...(row.run_id ? { runId: row.run_id } : {}),
    createdAt: row.created_at as number,
  };
}

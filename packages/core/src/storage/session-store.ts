import { randomUUID } from "node:crypto";
import type { Session, SessionMessage, SessionStore } from "@mineco/agent";
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

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom("messages").where("session_id", "=", id).execute();
    await this.db.deleteFrom("sessions").where("id", "=", id).execute();
  }
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
    createdAt: row.created_at as number,
  };
}

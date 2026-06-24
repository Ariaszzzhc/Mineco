/**
 * Canonical transcript over append-only NDJSON (ADR-0.4-1/2).
 *
 * Each session's transcript lives in
 * `~/.mineco/sessions/<ws-key>/<session-id>.messages.ndjson` — one JSON
 * {@link Message} per line, oldest first. Replaces `db/messages.ts` with the
 * same exported signatures (async).
 *
 * The transcript file sits next to the session sidecar; we resolve the
 * `<ws-key>` from the session sidecar so a caller only needs the session id.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { EngineId, Message } from "@/shared/agent-protocol";
import { appendNdjson, readNdjson } from "./json-file";
import { messagesFile, sessionsRoot } from "./paths";

/** Resolves a session's transcript path by locating its sidecar across the
 * `<ws-key>` dirs. Falls back to the public dir if no sidecar is found yet. */
async function resolveMessagesFile(sessionId: string): Promise<string> {
  let keys: string[];
  try {
    const entries = await fs.readdir(sessionsRoot(), { withFileTypes: true });
    keys = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    keys = [];
  }
  for (const key of keys) {
    const sidecar = path.join(sessionsRoot(), key, `${sessionId}.json`);
    try {
      await fs.access(sidecar);
      return path.join(sessionsRoot(), key, `${sessionId}.messages.ndjson`);
    } catch {
      /* not in this ws-key dir */
    }
  }
  // No sidecar located — default to the public space (the session row should
  // exist by the time messages are written, so this is a safety net only).
  return messagesFile(null, sessionId);
}

/** The canonical engine-neutral transcript for a session, oldest first. */
export async function listMessages(sessionId: string): Promise<Message[]> {
  const file = await resolveMessagesFile(sessionId);
  const rows = await readNdjson<Message>(file);
  return rows.map((r) => ({ ...r, engine: r.engine as EngineId | null }));
}

export async function addMessage(input: {
  sessionId: string;
  turnId: string;
  role: Message["role"];
  content: string;
  reasoning?: string;
  tools?: string;
  engine: EngineId | null;
}): Promise<Message> {
  const message: Message = {
    id: randomUUID(),
    sessionId: input.sessionId,
    turnId: input.turnId,
    role: input.role,
    content: input.content,
    reasoning: input.reasoning ?? "",
    tools: input.tools ?? "[]",
    engine: input.engine,
    createdAt: Date.now(),
  };
  const file = await resolveMessagesFile(input.sessionId);
  await appendNdjson(file, message);
  return message;
}

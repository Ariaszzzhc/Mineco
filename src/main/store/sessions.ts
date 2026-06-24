/**
 * Sessions over per-session sidecar JSON (ADR-0.4-2).
 *
 * Each session is one `~/.mineco/sessions/<ws-key>/<session-id>.json` sidecar
 * holding the {@link Session} row plus the LAST-COMPLETED-TURN projection (the
 * only part of the old turn ledger anything reads back). The full turn ledger
 * from `db/turns.ts` is dropped — `getLastTurn` is now just the sidecar's
 * `last*` fields.
 *
 * Replaces `db/sessions.ts` + the read-back half of `db/turns.ts` with the same
 * exported signatures (all async) so call sites swap cleanly. Mutations are RMW
 * under the sidecar's per-path lock (R14); `finishTurn` carries the R4
 * error-path guard.
 *
 * Listing scans the per-workspace directory; `getSession` / single-session ops
 * must locate the sidecar without knowing the workspace, so they scan all
 * `<ws-key>` dirs.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { NormalizedUsage, Session } from "@/shared/agent-protocol";
import {
  readJson,
  removeFiles,
  withPathLock,
  writeJsonAtomicUnlocked,
} from "./json-file";
import { messagesFile, sessionFile, sessionsRoot } from "./paths";

/**
 * The on-disk sidecar: the session row plus the last-completed-turn projection.
 * `realCwd` is `realpath(cwd)` captured at create — the SDK encodes the realpath
 * for its `projects/<encoded-cwd>` dir (R3), so Phase 3/4's link work needs it.
 */
interface SessionSidecar {
  version: 1;
  session: Session;
  /** realpath(cwd) at create — see R3. May equal `session.cwd`. */
  realCwd: string;
  /** Resume handle from the last completed turn (null until one finishes). */
  lastNativeThreadId: string | null;
  /** Usage from the last completed turn. */
  lastUsage: NormalizedUsage | null;
  /** Concrete model id from the last completed turn. */
  lastModel: string | null;
  /** Status of the last turn (`done` | `error`). */
  lastTurnStatus: string | null;
}

/** The last-completed-turn projection callers consume (was `db/turns.ts`'s
 * `getLastTurn`). Field names preserved to avoid contract churn. */
export interface LastTurn {
  nativeThreadId: string | null;
  usage: NormalizedUsage | null;
  model: string | null;
}

function newSidecar(session: Session, realCwd: string): SessionSidecar {
  return {
    version: 1,
    session,
    realCwd,
    lastNativeThreadId: null,
    lastUsage: null,
    lastModel: null,
    lastTurnStatus: null,
  };
}

/** Lists the `<ws-key>` directory names under `~/.mineco/sessions`. */
async function listWsKeys(): Promise<string[]> {
  try {
    const entries = await fs.readdir(sessionsRoot(), { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/** Reads every sidecar in one `<ws-key>` dir. */
async function readSidecarsIn(wsKey: string): Promise<SessionSidecar[]> {
  const dir = path.join(sessionsRoot(), wsKey);
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: SessionSidecar[] = [];
  for (const name of names) {
    if (!name.endsWith(".json") || name.endsWith(".messages.ndjson")) continue;
    const sc = await readJson<SessionSidecar | null>(
      path.join(dir, name),
      null,
    );
    if (sc?.session) out.push(sc);
  }
  return out;
}

/** Finds a session's sidecar across all `<ws-key>` dirs (we don't know its
 * workspace from the id alone). Returns the sidecar + the file path. */
async function findSidecar(
  sessionId: string,
): Promise<{ sidecar: SessionSidecar; file: string } | null> {
  for (const wsKey of await listWsKeys()) {
    const file = path.join(sessionsRoot(), wsKey, `${sessionId}.json`);
    const sc = await readJson<SessionSidecar | null>(file, null);
    if (sc?.session?.id === sessionId) return { sidecar: sc, file };
  }
  return null;
}

/** Lists sessions, optionally filtered to one workspace. Pass `undefined` for
 * all sessions, or `null` for the public/shared (no-workspace) space. */
export async function listSessions(
  workspaceId?: string | null,
): Promise<Session[]> {
  let sidecars: SessionSidecar[];
  if (workspaceId === undefined) {
    const keys = await listWsKeys();
    sidecars = (await Promise.all(keys.map(readSidecarsIn))).flat();
  } else {
    sidecars = await readSidecarsIn(workspaceId ?? "public");
  }
  return sidecars
    .map((s) => s.session)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getSession(id: string): Promise<Session | null> {
  const found = await findSidecar(id);
  return found?.sidecar.session ?? null;
}

/**
 * The `realpath(cwd)` captured at session-create (R3). The link/resume work
 * (Phase 4) must encode this exact value — the SDK encodes the realpath for its
 * `projects/<encoded-cwd>` dir, and `query({cwd})` is given the same value so
 * the encodings line up. Falls back to the raw `session.cwd` when no sidecar is
 * found (caller will realpath defensively).
 */
export async function getSessionRealCwd(id: string): Promise<string | null> {
  const found = await findSidecar(id);
  if (!found) return null;
  return found.sidecar.realCwd ?? found.sidecar.session.cwd;
}

export async function createSession(input: {
  workspaceId: string | null;
  agentId: string | null;
  title?: string;
  cwd: string;
}): Promise<Session> {
  const session: Session = {
    id: randomUUID(),
    workspaceId: input.workspaceId ?? null,
    agentId: input.agentId ?? null,
    title: input.title?.trim() || "Untitled",
    cwd: input.cwd,
    createdAt: Date.now(),
  };
  // Store realpath(cwd) for the link work (R3); fall back to cwd if it can't be
  // resolved yet (e.g. dir created lazily elsewhere).
  let realCwd = input.cwd;
  try {
    realCwd = await fs.realpath(input.cwd);
  } catch {
    /* keep the raw cwd */
  }
  const file = sessionFile(session.workspaceId, session.id);
  await writeJsonAtomicUnlocked(file, newSidecar(session, realCwd));
  return session;
}

export async function setSessionTitle(
  id: string,
  title: string,
): Promise<void> {
  const found = await findSidecar(id);
  if (!found) return;
  await withPathLock(found.file, async () => {
    const sc = await readJson<SessionSidecar | null>(found.file, null);
    if (!sc) return;
    sc.session = { ...sc.session, title };
    await writeJsonAtomicUnlocked(found.file, sc);
  });
}

export async function deleteSession(id: string): Promise<void> {
  const found = await findSidecar(id);
  if (!found) return;
  const ws = found.sidecar.session.workspaceId;
  await removeFiles(found.file, messagesFile(ws, id));
}

/** Rebinds a session to a (possibly new) agent id. Absorbs the old
 * `db/sessions.ts` rebind that session-runner inlined via raw SQL. */
export async function rebindSessionAgent(
  sessionId: string,
  agentId: string,
): Promise<void> {
  const found = await findSidecar(sessionId);
  if (!found) return;
  await withPathLock(found.file, async () => {
    const sc = await readJson<SessionSidecar | null>(found.file, null);
    if (!sc) return;
    sc.session = { ...sc.session, agentId };
    await writeJsonAtomicUnlocked(found.file, sc);
  });
}

/**
 * The last completed turn's resume projection — drives the resume-vs-seed
 * decision. Returns `{ nativeThreadId, usage, model }` or null when no turn has
 * finished yet.
 */
export async function getLastTurn(sessionId: string): Promise<LastTurn | null> {
  const found = await findSidecar(sessionId);
  if (!found) return null;
  const sc = found.sidecar;
  if (sc.lastTurnStatus === null) return null;
  return {
    nativeThreadId: sc.lastNativeThreadId,
    usage: sc.lastUsage,
    model: sc.lastModel,
  };
}

/**
 * Records the outcome of a completed turn into the session sidecar's
 * last-turn projection. Keyed by sessionId (the turn ledger is gone).
 *
 * R4 error-path guard: on an `error` turn, only overwrite `lastNativeThreadId`
 * when the incoming value is non-null — a failed/aborted turn must not clobber a
 * good resume handle with null. Partial `lastUsage` / `lastModel` are still
 * persisted.
 */
export async function finishTurn(
  sessionId: string,
  input: {
    status: "done" | "error";
    nativeThreadId: string | null;
    usage: NormalizedUsage | null;
    model?: string | null;
  },
): Promise<void> {
  const found = await findSidecar(sessionId);
  if (!found) return;
  await withPathLock(found.file, async () => {
    const sc = await readJson<SessionSidecar | null>(found.file, null);
    if (!sc) return;
    if (input.status === "error") {
      // Only advance the resume handle if we actually got one.
      if (input.nativeThreadId !== null) {
        sc.lastNativeThreadId = input.nativeThreadId;
      }
    } else {
      sc.lastNativeThreadId = input.nativeThreadId;
    }
    if (input.usage !== null) sc.lastUsage = input.usage;
    if (input.model !== undefined && input.model !== null) {
      sc.lastModel = input.model;
    }
    sc.lastTurnStatus = input.status;
    await writeJsonAtomicUnlocked(found.file, sc);
  });
}

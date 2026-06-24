/**
 * Filesystem path helpers for the all-file runtime store (EDD ADR-6 / ADR-0.4-2).
 *
 * Runtime state lives under `~/.mineco/`:
 *   - `workspaces.json` — the workspace table (versioned envelope).
 *   - `sessions/<ws-key>/<session-id>.json` — per-session sidecar (session row +
 *     last-completed-turn projection).
 *   - `sessions/<ws-key>/<session-id>.messages.ndjson` — the canonical transcript.
 *
 * `<ws-key>` is the workspace id, or the literal `"public"` for the null
 * (shared/no-workspace) space.
 */

import os from "node:os";
import path from "node:path";

/** Root config + runtime dir: `~/.mineco`. */
export function minecoDir(): string {
  return path.join(os.homedir(), ".mineco");
}

/** The workspace table file: `~/.mineco/workspaces.json`. */
export function workspacesFile(): string {
  return path.join(minecoDir(), "workspaces.json");
}

/** Maps a workspace id (or null) to its on-disk directory key. The null
 * (shared/public) workspace uses the literal `"public"`. */
export function wsKey(workspaceId: string | null): string {
  return workspaceId ?? "public";
}

/** The sessions root: `~/.mineco/sessions`. */
export function sessionsRoot(): string {
  return path.join(minecoDir(), "sessions");
}

/** Per-workspace sessions dir: `~/.mineco/sessions/<ws-key>`. */
export function sessionsDir(workspaceId: string | null): string {
  return path.join(sessionsRoot(), wsKey(workspaceId));
}

/** The session sidecar JSON path. */
export function sessionFile(
  workspaceId: string | null,
  sessionId: string,
): string {
  return path.join(sessionsDir(workspaceId), `${sessionId}.json`);
}

/** The session transcript NDJSON path (sibling of the sidecar). */
export function messagesFile(
  workspaceId: string | null,
  sessionId: string,
): string {
  return path.join(sessionsDir(workspaceId), `${sessionId}.messages.ndjson`);
}

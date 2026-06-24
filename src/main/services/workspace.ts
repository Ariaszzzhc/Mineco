/**
 * Workspace service — thin orchestration layer over `db/workspaces.ts`.
 *
 * Responsibilities:
 *   - `activate(id)`: returns a workspace projection (workspace + session count)
 *     for the sidebar to refresh on workspace switch.
 *   - `rememberSelection(id, mode, agentId)`: persists the last-used run mode +
 *     agent for a workspace so the composer can restore them (FR-11).
 *   - `resolveCwd(workspace)`: resolves the effective working directory — the
 *     workspace's `rootPath`, or the public scratch dir (`~/.mineco/public`).
 *   - `ensurePublicWorkspaceExists()`: idempotent bootstrap call; ensures the
 *     no-workspace `rootPath=null` sentinel is present in the DB.
 *
 * Run state (which sessions are running) is NOT managed here — see
 * `run-registry.ts` (which is in-memory and not persisted).
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Workspace } from "@/shared/agent-protocol";
import { sessionsDir } from "../store/paths";
import { getSessionRealCwd, listSessions } from "../store/sessions";
import {
  deleteWorkspace as deleteWorkspaceRow,
  ensurePublicWorkspace,
  getWorkspace,
  setLastSelection,
} from "../store/workspaces";
import { isCwdLive } from "./engine-sessions";

// Re-export the underlying file-store CRUD so callers only need one import.
export {
  createWorkspace,
  listWorkspaces,
  updateWorkspace,
} from "../store/workspaces";

/**
 * Deletes a workspace: removes its row from `workspaces.json`, then `rm -rf`s
 * its per-workspace sessions directory (`~/.mineco/sessions/<id>/`).
 *
 * ADR-0.4-7 gate: that directory becomes a SHARED native target after ADR-11,
 * so we must not `rm -rf` it while a warm subprocess holds it open. We check the
 * live engine-session map (via `isCwdLive`) for any session in THIS workspace
 * still warm; if one is, we skip the on-disk sweep (the row is still removed)
 * and the orphaned dir is reclaimed on the next clean launch.
 */
export async function deleteWorkspace(id: string): Promise<void> {
  // Resolve the realCwds of this workspace's sessions BEFORE dropping the row,
  // so we can ask the live map whether any warm subprocess still holds them.
  const sessions = await listSessions(id);
  const realCwds = await Promise.all(
    sessions.map((s) => getSessionRealCwd(s.id)),
  );
  await deleteWorkspaceRow(id);
  const anyLive = realCwds.some((c) => c != null && isCwdLive(c));
  if (anyLive) return;
  await fs
    .rm(sessionsDir(id), { recursive: true, force: true })
    .catch(() => undefined);
}

/** Default public scratch directory used when `rootPath` is null. */
function publicScratchDir(): string {
  return path.join(os.homedir(), ".mineco", "public");
}

/** Projection returned by `activate()` for the sidebar. */
export interface WorkspaceActivation {
  workspace: Workspace;
  sessionCount: number;
}

/**
 * "Activates" a workspace: fetches it from the DB and attaches a session count.
 * The renderer uses this to refresh the sidebar after the user switches
 * workspaces. Does NOT track a global "current workspace" — that lives in the
 * renderer's `$state`.
 *
 * Returns `null` if the workspace is not found.
 */
export async function activate(
  workspaceId: string,
): Promise<WorkspaceActivation | null> {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return null;

  const sessions = await listSessions(workspaceId);
  return { workspace, sessionCount: sessions.length };
}

/**
 * Persists the last-used run mode + agent for a workspace so the composer can
 * restore them the next time the user returns to it.
 */
export async function rememberSelection(
  workspaceId: string,
  mode: string | null,
  agentId: string | null,
): Promise<void> {
  await setLastSelection(workspaceId, mode, agentId);
}

/**
 * Resolves the effective working directory for a workspace turn.
 *   - Named workspace with a `rootPath` → that path.
 *   - Public / no-workspace (`rootPath === null`) → `~/.mineco/public` (created
 *     lazily so file tools always have a valid cwd).
 */
export async function resolveCwd(workspace: Workspace): Promise<string> {
  if (workspace.rootPath) return workspace.rootPath;
  const dir = publicScratchDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Resolves the working directory for a session given only its workspace id —
 * the form the session-create IPC receives. A real workspace uses its
 * `rootPath`; the public/no-workspace case (id null, missing, or a `rootPath`
 * null sentinel) resolves to the public scratch dir (`~/.mineco/public`).
 *
 * This is where the no-workspace contract lives: the sandboxed renderer never
 * computes paths, so it just sends the workspace id and the main process maps
 * it to a concrete, always-valid cwd.
 */
export async function resolveCwdFor(
  workspaceId: string | null,
): Promise<string> {
  if (workspaceId) {
    const ws = await getWorkspace(workspaceId);
    if (ws) return resolveCwd(ws);
  }
  const dir = publicScratchDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Ensures the public/shared workspace sentinel (`rootPath=null`) exists in the
 * DB. Also ensures the public scratch directory exists on disk.
 *
 * Safe to call on every app start — `ensurePublicWorkspace` is idempotent.
 */
export async function ensurePublicWorkspaceExists(): Promise<Workspace> {
  const ws = await ensurePublicWorkspace();
  // Lazily create the scratch dir as well.
  await fs.mkdir(publicScratchDir(), { recursive: true });
  return ws;
}

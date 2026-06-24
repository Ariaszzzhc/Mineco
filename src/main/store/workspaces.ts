/**
 * Workspace table over `~/.mineco/workspaces.json` (ADR-0.4-2).
 *
 * Replaces `db/workspaces.ts` with identical exports so call sites swap
 * cleanly. The whole table lives in one versioned-envelope JSON file; mutations
 * are read-modify-write under the file's per-path lock (R14) so concurrent
 * writers can't clobber each other.
 */

import { randomUUID } from "node:crypto";
import type { Workspace } from "@/shared/agent-protocol";
import { readJson, withPathLock, writeJsonAtomicUnlocked } from "./json-file";
import { workspacesFile } from "./paths";

/** On-disk envelope; `version` lets us migrate the shape later. */
interface WorkspacesEnvelope {
  version: 1;
  workspaces: Workspace[];
}

const EMPTY: WorkspacesEnvelope = { version: 1, workspaces: [] };

function read(): Promise<WorkspacesEnvelope> {
  return readJson<WorkspacesEnvelope>(workspacesFile(), EMPTY);
}

/** Read-modify-write the envelope under the file lock. The write uses the
 * unlocked atomic primitive because we already hold the path lock here (calling
 * the locking `writeJsonAtomic` would deadlock on the same key). */
function mutate<T>(
  fn: (env: WorkspacesEnvelope) => { env: WorkspacesEnvelope; result: T },
): Promise<T> {
  return withPathLock(workspacesFile(), async () => {
    const env = await readJson<WorkspacesEnvelope>(workspacesFile(), EMPTY);
    const { env: next, result } = fn(env);
    await writeJsonAtomicUnlocked(workspacesFile(), next);
    return result;
  });
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const env = await read();
  return [...env.workspaces].sort((a, b) => a.createdAt - b.createdAt);
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  const env = await read();
  return env.workspaces.find((w) => w.id === id) ?? null;
}

export async function createWorkspace(input: {
  name: string;
  /** Absolute project path, or null for the public/shared workspace. */
  rootPath: string | null;
}): Promise<Workspace> {
  const workspace: Workspace = {
    id: randomUUID(),
    name: input.name.trim() || "Workspace",
    rootPath: input.rootPath,
    lastMode: null,
    lastAgentId: null,
    createdAt: Date.now(),
  };
  await mutate((env) => ({
    env: { ...env, workspaces: [...env.workspaces, workspace] },
    result: undefined,
  }));
  return workspace;
}

export async function updateWorkspace(input: {
  id: string;
  name: string;
  rootPath: string | null;
}): Promise<void> {
  await mutate((env) => ({
    env: {
      ...env,
      workspaces: env.workspaces.map((w) =>
        w.id === input.id
          ? { ...w, name: input.name, rootPath: input.rootPath }
          : w,
      ),
    },
    result: undefined,
  }));
}

export async function deleteWorkspace(id: string): Promise<void> {
  await mutate((env) => ({
    env: { ...env, workspaces: env.workspaces.filter((w) => w.id !== id) },
    result: undefined,
  }));
}

/** Records the last-used run mode + agent for a workspace, so the composer can
 * restore the user's selection when they return to it. */
export async function setLastSelection(
  id: string,
  mode: string | null,
  agentId: string | null,
): Promise<void> {
  await mutate((env) => ({
    env: {
      ...env,
      workspaces: env.workspaces.map((w) =>
        w.id === id ? { ...w, lastMode: mode, lastAgentId: agentId } : w,
      ),
    },
    result: undefined,
  }));
}

/** Ensures a single public/shared workspace (`rootPath` null) exists and returns
 * it. Idempotent: reuses the existing one if present. */
export async function ensurePublicWorkspace(): Promise<Workspace> {
  return mutate((env) => {
    const existing = [...env.workspaces]
      .filter((w) => w.rootPath === null)
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (existing) return { env, result: existing };
    const workspace: Workspace = {
      id: randomUUID(),
      name: "Public",
      rootPath: null,
      lastMode: null,
      lastAgentId: null,
      createdAt: Date.now(),
    };
    return {
      env: { ...env, workspaces: [...env.workspaces, workspace] },
      result: workspace,
    };
  });
}

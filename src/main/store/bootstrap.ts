/**
 * One-shot launch bootstrap for the 0.4 all-file storage (OD-1 → Option B,
 * §7 fresh-drop + orphan-sweep).
 *
 * On the first 0.4 launch:
 *   1. If a legacy `~/.mineco/mineco.db` exists, rename it aside
 *      (`mineco.db.0.3-backup-<ts>`) — recoverable, never deleted. No
 *      resume-handle import path (fresh-drop): existing sessions lose native
 *      resume.
 *   2. Sweep + delete the now-orphaned native session JSONL under
 *      `~/.mineco/engines/claude/*​/projects/*` so the fresh start doesn't leak
 *      old transcripts into ADR-11's shared targets.
 *
 * ADR-0.4-7 gate: never touch a `projects/<encoded-cwd>` dir a warm subprocess
 * holds open. At cold launch the live engine-session map is empty, so the sweep
 * is unconstrained; the gate is defensive (no-op if any session is somehow
 * already live).
 *
 * Idempotent: once the DB is renamed aside, step 1 is a no-op; step 2 only finds
 * orphans the first time (later runs create fresh native dirs that are NOT
 * orphans, but bootstrap runs only at whenReady before any session opens, so the
 * live map is empty and we'd re-sweep — hence we mark completion with a sentinel
 * so we sweep exactly once).
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { liveEncodedDirNames } from "@/main/services/engine-sessions";

function minecoHome(): string {
  return path.join(os.homedir(), ".mineco");
}

function legacyDbPath(): string {
  return path.join(minecoHome(), "mineco.db");
}

/** Sentinel marking that the one-shot 0.4 fresh-drop sweep already ran. */
function sentinelPath(): string {
  return path.join(minecoHome(), ".bootstrap-0.4");
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Renames the legacy SQLite DB aside (recoverable). No-op if absent. */
async function renameDbAside(): Promise<void> {
  const db = legacyDbPath();
  if (!(await exists(db))) return;
  const aside = `${db}.0.3-backup-${Date.now()}`;
  await fs.rename(db, aside).catch(() => undefined);
  // Sidecar WAL/SHM files, if any, follow.
  for (const ext of ["-wal", "-shm"]) {
    await fs.rm(`${db}${ext}`, { force: true }).catch(() => undefined);
  }
}

/**
 * Deletes the orphaned native `projects/*` subtree under each agent config dir,
 * gated against live sessions (ADR-0.4-7).
 */
async function sweepOrphanedNativeSessions(): Promise<void> {
  // ADR-0.4-7 gate: never touch a `projects/<encoded-cwd>` dir a warm
  // subprocess holds open. At cold launch (the normal case) this set is empty,
  // so every native dir is an orphan and gets swept; the per-dir check is
  // defensive against a session somehow already being live.
  const liveDirs = liveEncodedDirNames();

  const enginesDir = path.join(minecoHome(), "engines", "claude");
  let agentIds: string[];
  try {
    const entries = await fs.readdir(enginesDir, { withFileTypes: true });
    agentIds = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  for (const agentId of agentIds) {
    const projectsDir = path.join(enginesDir, agentId, "projects");
    if (liveDirs.size === 0) {
      // Fast path: nothing live, drop the whole subtree.
      await fs
        .rm(projectsDir, { recursive: true, force: true })
        .catch(() => undefined);
      continue;
    }
    // Something is live: sweep each encoded dir except the held ones.
    let names: string[];
    try {
      names = await fs.readdir(projectsDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    for (const name of names) {
      if (liveDirs.has(name)) continue;
      await fs
        .rm(path.join(projectsDir, name), { recursive: true, force: true })
        .catch(() => undefined);
    }
  }
}

/**
 * Runs the one-shot fresh-drop migration. Safe to call on every launch — it
 * does its destructive work exactly once (guarded by a sentinel file) and is a
 * no-op thereafter.
 */
export async function bootstrap(): Promise<void> {
  await fs.mkdir(minecoHome(), { recursive: true });
  if (await exists(sentinelPath())) return;

  await renameDbAside();
  await sweepOrphanedNativeSessions();

  // Mark completion so we never re-sweep on later launches (where fresh native
  // dirs would otherwise look like orphans to the empty-live-map check).
  await fs
    .writeFile(sentinelPath(), `${new Date().toISOString()}\n`, "utf8")
    .catch(() => undefined);
}

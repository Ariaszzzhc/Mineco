/**
 * Native-dir linking for transcript-sharing + resume + auto-memory (ADR-0.4-3/4).
 *
 * The Claude CLI stores per-session state under
 * `<CONFIG_DIR>/projects/<encoded-cwd>/` (the `<uuid>.jsonl` transcript and a
 * sibling `memory/` dir). By symlinking that per-agent `projects/<encoded-cwd>`
 * dir at a single shared target (`~/.mineco/sessions/<ws-key>/`), every
 * same-workspace agent transparently shares transcripts AND memory through one
 * link — created once per (agent, workspace) at cold `openSession`.
 *
 * `encodeCwd` reproduces the SDK's native dir-name encoding EXACTLY. Verified
 * against `node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs`:
 *
 *   rr(cwd) = So(nz(cwd))
 *   nz(e)   = Or(realpathSync(resolve(e ?? ".")))   // Or = NFC on darwin
 *   So(e)   = { let t = e.replace(/[^a-zA-Z0-9]/g,"-");
 *               if (t.length <= 200) return t;
 *               return `${t.slice(0,200)}-${a6(e)}`; } // dashed string is
 *                                                    // TRUNCATED to 200 chars,
 *                                                    // then the hash (over the
 *                                                    // NFC input, NOT the dashed
 *                                                    // string) is appended.
 *   a6(e)   = Math.abs(My(e)).toString(36)
 *   My(e)   = { let t=0; for(...) t=(t<<5)-t+e.charCodeAt(r)|0; return t; }
 *             // (t<<5)-t === t*31 + c  →  Java String.hashCode, NOT djb2.
 *
 * Callers must store `realpath(cwd)` at session-create and pass the same value
 * here and to `query({cwd})` so encodings line up (ADR-0.4-4 realpath coupling).
 */

import { realpathSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { sessionsDir } from "@/main/store/paths";

/** Dashed-string length threshold above which the SDK appends a hash suffix. */
const MAX_DASHED_LENGTH = 200;

/**
 * Java `String.hashCode`: `t = t*31 + c` per UTF-16 code unit, wrapped to a
 * signed 32-bit int via `| 0` each step. This is the SDK's `My(e)` verbatim —
 * NOT djb2 (`t*33 ^ c`). Exported for fixture tests.
 */
export function javaHashCode(s: string): number {
  let t = 0;
  for (let r = 0; r < s.length; r++) {
    t = ((t << 5) - t + s.charCodeAt(r)) | 0;
  }
  return t;
}

/**
 * NFC-normalize on darwin only (the SDK's `Or(e)`). The CONFIG_DIR and every
 * encoded cwd are NFC-normalized on macOS; skipping this silently mismatches
 * any non-ASCII path.
 */
function nfc(s: string): string {
  return process.platform === "darwin" ? s.normalize("NFC") : s;
}

/**
 * The SDK's `So(e)`: sanitize to `[a-zA-Z0-9]` → `-`, and if the result exceeds
 * 200 chars TRUNCATE the dashed string to 200 chars and append
 * `-${Math.abs(javaHashCode(e)).toString(36)}`. Two critical details, both
 * verified against the installed `sdk.mjs`
 * (`function So(e){...return \`${t.slice(0,Di)}-${a6(e)}\`}`):
 *   1. The dashed string is sliced to the first 200 chars — NOT kept whole. The
 *      hash disambiguates the truncated tail, so appending it to the full string
 *      yields a DIFFERENT dir name than the SDK and breaks sharing (R1).
 *   2. The hash is computed over the (already NFC-normalized) *input* `e`, not
 *      over the dashed string.
 */
function sanitize(e: string): string {
  const dashed = e.replace(/[^a-zA-Z0-9]/g, "-");
  if (dashed.length <= MAX_DASHED_LENGTH) return dashed;
  return `${dashed.slice(0, MAX_DASHED_LENGTH)}-${Math.abs(javaHashCode(e)).toString(36)}`;
}

/**
 * Encode an absolute cwd into the native `projects/<dir>` name, byte-for-byte
 * matching the Claude SDK. Mirrors `nz` then `So`:
 *   - `path.resolve` then `realpathSync` (fall back to the resolved path on a
 *     throw — e.g. the dir does not exist yet);
 *   - NFC on darwin;
 *   - sanitize (+ Java-hashCode suffix for >200-char dashed strings).
 *
 * Pass `realpath(cwd)` (the value stored at session-create); we still resolve +
 * realpath defensively so the encoding is stable regardless of caller hygiene.
 */
export function encodeCwd(cwd: string): string {
  const resolved = path.resolve(cwd ?? ".");
  let real: string;
  try {
    real = realpathSync(resolved);
  } catch {
    real = resolved;
  }
  return sanitize(nfc(real));
}

/** Outcome of {@link ensureLink}. */
export type LinkResult =
  | { kind: "linked"; linkPath: string; target: string }
  | { kind: "migrated"; linkPath: string; target: string }
  | { kind: "deferred"; linkPath: string; target: string; reason: string }
  | { kind: "degraded"; linkPath: string; target: string; reason: string };

/** Predicate: is a warm engine-session currently holding `realCwd` open? */
export type IsLivePredicate = (realCwd: string) => boolean | Promise<boolean>;

export interface EnsureLinkOptions {
  /**
   * Gate for the destructive real-dir→link migration (ADR-0.4-7). When it
   * returns true the migration is deferred — never `mv`/`rmdir` a dir a warm
   * subprocess holds open. Defaults to "never live" (safe for cold-open paths;
   * Phase 4 wires the real engine-sessions check).
   */
  isLive?: IsLivePredicate;
}

/** Reads a symlink target, returning null when the path is not a symlink. */
async function readlinkOrNull(p: string): Promise<string | null> {
  try {
    return await fs.readlink(p);
  } catch (err) {
    // EINVAL → not a symlink; ENOENT → nothing there. Either way: no link.
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EINVAL" || code === "ENOENT") return null;
    throw err;
  }
}

/** lstat helper that returns null for a missing path. */
async function lstatOrNull(p: string): Promise<import("node:fs").Stats | null> {
  try {
    return await fs.lstat(p);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Create the symlink at `linkPath` → `target`, symlink-first with a Windows
 * junction fallback on EPERM. Returns true on success, false when neither tier
 * works (caller degrades to per-agent isolation, ADR-0.4-8).
 */
async function trySymlink(target: string, linkPath: string): Promise<boolean> {
  try {
    await fs.symlink(target, linkPath);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EPERM" && code !== "EACCES") throw err;
    // Windows: unprivileged users can't make dir symlinks but CAN make
    // junctions (NTFS only, absolute target).
    try {
      await fs.symlink(target, linkPath, "junction");
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Recursively merge the contents of `src` into `dest`, then remove `src`.
 * Existing files in `dest` win (the shared target is authoritative); only
 * entries absent from `dest` are moved over. Used when a REAL (non-link) native
 * dir is found where the shared link should be (a pre-0.4 / pre-link agent).
 */
async function mergeInto(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await mergeInto(from, to);
    } else {
      const exists = await lstatOrNull(to);
      if (!exists) {
        await fs.rename(from, to).catch(async () => {
          // Cross-device rename → copy then unlink.
          await fs.copyFile(from, to);
          await fs.rm(from, { force: true });
        });
      }
    }
  }
  await fs.rm(src, { recursive: true, force: true });
}

/**
 * Idempotently link an agent's `projects/<encodeCwd(realCwd)>` dir at the
 * shared per-workspace target `~/.mineco/sessions/<workspaceId|"public">/`.
 *
 * - Already a symlink to the right target → no-op (`linked`).
 * - A symlink pointing elsewhere → recreated (R9: detect via `readlink`).
 * - A REAL (non-link) dir → its contents are merged into the shared target and
 *   the dir is replaced by the link (`migrated`) — but ONLY when no live
 *   engine-session holds it; otherwise `deferred` (ADR-0.4-7).
 * - Nothing there → created (`linked`).
 * - Neither symlink nor junction works → `degraded` (ADR-0.4-8), so the caller
 *   keeps the per-agent isolated dir rather than throwing.
 */
export async function ensureLink(
  agentConfigDir: string,
  realCwd: string,
  workspaceId: string | null,
  opts: EnsureLinkOptions = {},
): Promise<LinkResult> {
  const target = sessionsDir(workspaceId);
  const projectsDir = path.join(agentConfigDir, "projects");
  const linkPath = path.join(projectsDir, encodeCwd(realCwd));
  const isLive = opts.isLive ?? (() => false);

  // The shared target must exist before anything points at it.
  await fs.mkdir(target, { recursive: true });
  await fs.mkdir(projectsDir, { recursive: true });

  const existingLink = await readlinkOrNull(linkPath);
  if (existingLink !== null) {
    // Resolve to compare absolute targets (junctions/relative links).
    const resolvedExisting = path.resolve(projectsDir, existingLink);
    if (resolvedExisting === path.resolve(target)) {
      return { kind: "linked", linkPath, target };
    }
    // Points elsewhere → recreate (R9).
    await fs.rm(linkPath, { force: true });
    if (await trySymlink(target, linkPath)) {
      return { kind: "linked", linkPath, target };
    }
    return {
      kind: "degraded",
      linkPath,
      target,
      reason: "symlink and junction both unavailable",
    };
  }

  const stat = await lstatOrNull(linkPath);
  if (stat?.isDirectory()) {
    // A REAL pre-link dir lives here. Gate the destructive migration.
    if (await isLive(realCwd)) {
      return {
        kind: "deferred",
        linkPath,
        target,
        reason: "a live engine-session holds this dir",
      };
    }
    await mergeInto(linkPath, target);
    if (await trySymlink(target, linkPath)) {
      return { kind: "migrated", linkPath, target };
    }
    return {
      kind: "degraded",
      linkPath,
      target,
      reason: "symlink and junction both unavailable after migration",
    };
  }

  if (stat) {
    // Something non-dir, non-symlink (a stray file) sits at the path — clear it.
    await fs.rm(linkPath, { force: true });
  }

  if (await trySymlink(target, linkPath)) {
    return { kind: "linked", linkPath, target };
  }
  return {
    kind: "degraded",
    linkPath,
    target,
    reason: "symlink and junction both unavailable",
  };
}

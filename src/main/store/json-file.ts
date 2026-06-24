/**
 * Atomic file primitives for the all-file runtime store (ADR-0.4-2).
 *
 *   - `writeJsonAtomic` — write a temp file, `fsync`, then `rename` over the
 *     target (POSIX-atomic; readers never see a torn write). R13.
 *   - `readJson` — read + parse, returning a fallback when the file is missing.
 *     A corrupt (unparseable) file is renamed aside and the fallback returned.
 *   - `appendNdjson` — append one JSON object as a single `\n`-terminated line.
 *   - `readNdjson` — parse an NDJSON file line-by-line, DROPPING a torn trailing
 *     line (a crash mid-append leaves an unterminated final line). R13.
 *   - `removeFiles` — best-effort unlink of several paths.
 *
 * A per-path async mutex serializes writes to the SAME file so concurrent
 * read-modify-write callers (e.g. `setSessionTitle` + `finishTurn` on one
 * sidecar) can't clobber each other. R14.
 */

import fs from "node:fs/promises";
import path from "node:path";

/** path → tail of the in-flight write chain for that path. */
const locks = new Map<string, Promise<unknown>>();

/**
 * Runs `fn` while holding the per-path lock — serializing it after any
 * in-flight operation on the same path. Resolves/rejects with `fn`'s result.
 */
export function withPathLock<T>(
  filePath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = path.resolve(filePath);
  const prev = locks.get(key) ?? Promise.resolve();
  // Chain after the previous op, swallowing its rejection so one failure
  // doesn't poison the queue. The returned promise still surfaces fn's result.
  const run = prev.then(fn, fn);
  // The bookkeeping tail never rejects, so a later waiter can't be poisoned.
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  locks.set(key, tail);
  // Drop the entry once this op is the queue tail and has settled, to bound the
  // map. If a newer op was queued in the meantime, leave its tail in place.
  void tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key);
  });
  return run;
}

async function ensureDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

/** Atomic write WITHOUT the per-path lock — for callers that already hold it
 * (e.g. inside a `withPathLock` read-modify-write). Most code wants
 * {@link writeJsonAtomic} instead. */
export async function writeJsonAtomicUnlocked(
  filePath: string,
  value: unknown,
): Promise<void> {
  await ensureDir(filePath);
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const data = `${JSON.stringify(value, null, 2)}\n`;
  const handle = await fs.open(tmp, "w");
  try {
    await handle.writeFile(data, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, filePath);
}

/** Atomically writes `value` as pretty JSON to `filePath` (tmp + fsync +
 * rename). Serialized per-path. */
export function writeJsonAtomic(
  filePath: string,
  value: unknown,
): Promise<void> {
  return withPathLock(filePath, () => writeJsonAtomicUnlocked(filePath, value));
}

/** Reads + parses JSON from `filePath`, returning `fallback` if it's missing.
 * A corrupt file is renamed aside (`.corrupt-<ts>`) and the fallback returned. */
export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    await fs
      .rename(filePath, `${filePath}.corrupt-${Date.now()}`)
      .catch(() => undefined);
    return fallback;
  }
}

/** Appends one record as a single newline-terminated JSON line. Serialized
 * per-path so concurrent appends don't interleave. */
export function appendNdjson(filePath: string, record: unknown): Promise<void> {
  return withPathLock(filePath, async () => {
    await ensureDir(filePath);
    await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
  });
}

/** Parses an NDJSON file into records. A torn trailing line (no terminating
 * newline — a crash mid-append) is dropped; other unparseable lines are skipped. */
export async function readNdjson<T>(filePath: string): Promise<T[]> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  if (!raw) return [];
  // A well-formed file ends in "\n"; if the last char isn't a newline the final
  // line was torn by a crash mid-append — drop it.
  const torn = !raw.endsWith("\n");
  const lines = raw.split("\n");
  // split on the trailing "\n" yields a final "" we always discard; if torn,
  // the real last line is incomplete and must also be discarded.
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  else if (torn) lines.pop();

  const out: T[] = [];
  for (const line of lines) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // skip an individually corrupt line
    }
  }
  return out;
}

/** Best-effort unlink of multiple paths (missing files ignored). */
export async function removeFiles(...paths: string[]): Promise<void> {
  await Promise.all(
    paths.map((p) => fs.rm(p, { force: true }).catch(() => undefined)),
  );
}

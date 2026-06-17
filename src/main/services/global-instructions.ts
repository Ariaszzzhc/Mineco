/**
 * Global instructions service — reads and writes `~/.mineco/MINECO.md`.
 *
 * The global instructions file is appended to the Claude system prompt on every
 * turn (via the SDK's `systemPrompt.append`). It is the user's single place for
 * cross-agent, cross-workspace behavioural overrides.
 *
 * - The file is created (empty) on first read if missing.
 * - Read never throws; write is best-effort (parent dir created lazily).
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const INSTRUCTIONS_PATH = path.join(os.homedir(), ".mineco", "MINECO.md");

export interface GlobalInstructions {
  /** Raw markdown text. Empty string when no file exists. */
  text: string;
  /** Last-modified epoch ms, or the current time when the file was just created. */
  updatedAt: number;
  /** Rough token estimate: `Math.ceil(text.length / 4)`. */
  tokenEstimate: number;
}

/**
 * Reads `~/.mineco/MINECO.md`. Creates the file (empty) if it does not exist.
 * Returns `{ text: "", updatedAt: now, tokenEstimate: 0 }` on any read error.
 */
export async function readGlobalInstructions(): Promise<GlobalInstructions> {
  try {
    const stat = await fs.stat(INSTRUCTIONS_PATH);
    const text = await fs.readFile(INSTRUCTIONS_PATH, "utf8");
    return {
      text,
      updatedAt: stat.mtimeMs,
      tokenEstimate: Math.ceil(text.length / 4),
    };
  } catch (err: unknown) {
    // File doesn't exist — create it empty and return defaults.
    if (isNotFound(err)) {
      try {
        await fs.mkdir(path.dirname(INSTRUCTIONS_PATH), { recursive: true });
        await fs.writeFile(INSTRUCTIONS_PATH, "", "utf8");
      } catch {
        // Ignore — we'll just return the empty defaults below.
      }
    }
    return { text: "", updatedAt: Date.now(), tokenEstimate: 0 };
  }
}

/**
 * Writes `text` to `~/.mineco/MINECO.md`, creating the parent directory as
 * needed.
 */
export async function writeGlobalInstructions(text: string): Promise<void> {
  await fs.mkdir(path.dirname(INSTRUCTIONS_PATH), { recursive: true });
  await fs.writeFile(INSTRUCTIONS_PATH, text, "utf8");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNotFound(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === "ENOENT";
}

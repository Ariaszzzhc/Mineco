/**
 * Paths and profile → SDK Options/env resolution (§3, §6, §7).
 *
 * Skeleton: shapes are in place; resolution logic lands in step 3–4.
 */

import { dirname, fromFileUrl, join } from 'jsr:@std/path@1';
import type { Profile } from '@/protocol';

/** Persistent Mineco home. DB + SDK transcripts live under here (§1, §3). */
export function minecoHome(): string {
  const home = Deno.env.get('HOME') ?? '/tmp';
  return join(home, '.mineco');
}

/** SQLite database path (§5). */
export function dbPath(): string {
  return join(minecoHome(), 'mineco.db');
}

/**
 * `CLAUDE_CONFIG_DIR` — points the SDK child at our persistent dir so its
 * native JSONL transcripts (the resume source of truth) land under ~/.mineco
 * (§3). Credentials are NOT read from here; we feed them via env.
 */
export function claudeConfigDir(): string {
  return minecoHome();
}

/**
 * Resolve the Claude Code entry the SDK spawns under `executable: 'deno'`.
 *
 * - dev (`deno run`): the SDK's bundled `cli.js`, resolved from the npm cache.
 * - compiled: a `claude` binary shipped next to `mineco-core` (§9.2 — works
 *   around `deno compile` not embedding the SDK's native binary, SDK issue #150).
 *
 * Falls back to the compiled-binary layout if dev resolution fails.
 */
export function pathToClaudeCodeExecutable(): string {
  const exe = Deno.mainModule;
  if (exe.startsWith('file:')) {
    try {
      return fromFileUrl(import.meta.resolve('@anthropic-ai/claude-agent-sdk/cli.js'));
    } catch {
      return join(dirname(fromFileUrl(exe)), 'claude');
    }
  }
  // Compiled binary: resources sit next to the binary.
  return join(dirname(exe), 'claude');
}

/**
 * Build the SDK `Options.env` for a profile (§3, §6).
 *
 * ⚠️ SDK `Options.env` REPLACES rather than merges — always spread the process
 * env first, then layer profile auth/endpoint on top. For a custom gateway,
 * blank out `ANTHROPIC_API_KEY` to disable default auth (§3).
 *
 * Skeleton returns the merge envelope; auth mapping lands in step 4.
 */
export function profileEnv(profile: Profile): Record<string, string> {
  const base: Record<string, string> = {
    ...Deno.env.toObject(),
    CLAUDE_CONFIG_DIR: claudeConfigDir(),
  };

  switch (profile.provider) {
    case 'anthropic':
      base.ANTHROPIC_API_KEY = profile.api_key;
      break;
    case 'custom':
      base.ANTHROPIC_BASE_URL = profile.base_url;
      base.ANTHROPIC_AUTH_TOKEN = profile.api_key;
      base.ANTHROPIC_API_KEY = ''; // disable default auth (§3)
      break;
  }

  if (profile.default_model) {
    base.ANTHROPIC_MODEL = profile.default_model;
  }

  return base;
}

# Claude.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

Mineco is a macOS-native AI coding assistant (desktop app). Architecture per
`docs/PRD.md` and `docs/technical-design.md`:

- **`macos/Mineco/`** — native SwiftUI app, a *thin client*: only renders and
  forwards JSON-RPC. No business logic, no secrets, no direct DB access.
- **`packages/core/`** — the single Deno process (compiled to `mineco-core`).
  Owns all business logic: config/profiles, credentials, env assembly, the
  SDK-driven session runners, SQLite, usage recording. Speaks newline-delimited
  JSON-RPC 2.0 over stdio with the SwiftUI client.
- **`packages/protocol/`** — the wire contract (zod schemas + TS types),
  single source of truth shared by core and (as Codable) by Swift.
- The agent engine is `@anthropic-ai/claude-agent-sdk` (spawns the official
  `claude` binary per session). Mineco does **not** implement its own agent
  loop.

Storage: `~/.mineco/mineco.db` (SQLite, UI/stats/config only) and
`~/.mineco/projects/` (SDK-native JSONL transcripts — the resume source of
truth).

## Rules

- **Do not run a dev server.** To verify, use tests.
- **Always run `deno test` at the repo root** for unit tests.
- Other root tasks: `deno lint`, `deno fmt` (and `deno fmt --check`),
  `deno check packages`, `deno task compile`.
- Toolchain is **Deno only** (no pnpm/turbo/biome/vitest/tsc). Node built-ins
  used via `node:` (e.g. `node:sqlite`); such code needs `--unstable`.
- The protocol package (`packages/protocol`) is the TS↔Swift contract — change
  schemas deliberately and update the fixtures under
  `packages/protocol/fixtures/` in the same step.
- This repo is a rewrite. `backup/` holds the original codebase for reference
  only — do not import from it.

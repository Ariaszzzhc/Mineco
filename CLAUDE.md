# CLAUDE.md

Guidance for working in this repository.

## What this is

A minimal **Electron + Svelte 5 + Vite 8** desktop **meta-agent**: it drives
multiple underlying agent engines — the
[Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
and the [Codex SDK](https://www.npmjs.com/package/@openai/codex-sdk) — behind one
abstraction. The user configures providers (engine + model + credentials) and
picks one per turn. The goal is a small, correct end-to-end flow, not a
feature-complete product.

## Architecture

The Agent SDKs require Node.js (each spawns a CLI subprocess), so they run **only
in the Electron main process**. The renderer (Svelte) is a thin client that
talks to the main process over IPC.

```
electron/main.ts            Main process: window + IPC surface (CRUD + turn runner)
electron/preload.ts         contextBridge -> window.mineco (profiles/sessions/runTurn)
electron/session-runner.ts  Orchestrates one turn: resume-vs-seed, persist, stream
electron/engines/           Engine abstraction: types.ts (Engine + NormalizedEvent +
                            buildPrompt), claude.ts, codex.ts, registry.ts
electron/db/                Kysely-on-node:sqlite persistence: index.ts (Kysely +
                            schema DDL), schema.ts (table types),
                            node-sqlite-dialect.ts (inlined dialect) + repos
src/lib/agent-protocol.ts   Shared domain model + NormalizedEvent + IPC channels
src/App.svelte              Renderer: provider config + chat UI (Svelte 5 runes)
src/main.ts                 Renderer entry (mounts App)
index.html                  Renderer HTML (+ CSP)
```

Flow: renderer calls `window.mineco.runTurn()` → preload `ipcRenderer.send` on
`mineco:turn:run` → `session-runner` picks the engine from the request's profile,
runs it, and streams `NormalizedEvent`s back on a per-request channel
(`mineco:turn:event:<id>`) → preload forwards to the callback.

**Engine switching:** a session is engine-neutral; the engine is chosen per turn.
Native thread state is NOT portable between CLIs, so mineco owns the canonical
transcript (SQLite `messages`). Same engine as the last turn → native `resume`
(`nativeThreadId`); a different engine → start fresh and rehydrate via
`buildPrompt` (prior transcript prepended). See `electron/session-runner.ts` and
`engines/types.ts:buildPrompt`.

## Commands

- `pnpm dev` — Vite + Electron with HMR (primary workflow)
- `pnpm build` — builds renderer (`dist/`) and main+preload (`dist-electron/`)
- `pnpm check` — `svelte-check` + `tsc` (run before committing)
- `pnpm lint` / `pnpm format` — Biome

Credentials come from the provider profile (stored plaintext in SQLite for v1).
The adapters inject them per engine: Claude → `ANTHROPIC_API_KEY` /
`ANTHROPIC_BASE_URL`; Codex → `apiKey` / `baseUrl` on the `Codex` constructor.
An empty key falls back to whatever ambient env the launching shell provides.
Data lives at `~/.mineco/mineco.db`.

## Conventions & gotchas

- **Agent SDKs are main-process only.** Never import them in renderer code.
- **Adding an engine:** implement `Engine` in `electron/engines/`, map the native
  stream to `NormalizedEvent`, and register it in `registry.ts`. Nothing else
  (renderer, IPC, persistence) should need to know the engine exists.
- **Security baseline** (do not weaken): `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`. The renderer reaches Node only
  through the narrow preload bridge.
- **Preload must be CommonJS** (`dist-electron/preload.cjs`). Vite/rolldown's
  default emits a CJS file with an `.mjs` extension under `"type": "module"`,
  which crashes — `vite.config.ts` overrides `entryFileNames` to `.cjs`.
- **`main` build externalizes both SDKs** (`rolldownOptions.external` — note: on
  Vite 8 it's `rolldownOptions`, not `rollupOptions`). Each SDK resolves its own
  bundled CLI/assets at runtime, so it must not be bundled. (Codex ships its CLI
  as the `@openai/codex` dep — no separate PATH install needed.)
- **Persistence is `node:sqlite`** (built into the Node 24 that Electron 42
  bundles — no native module to rebuild against the Electron ABI). If a future
  Electron flags it off, fall back to `better-sqlite3` + `electron-rebuild`.
- **Queries go through Kysely** over an **inlined** dialect
  (`db/node-sqlite-dialect.ts`) — stock Kysely's SQLite dialect targets
  `better-sqlite3`, so we wrap `DatabaseSync` ourselves (reusing Kysely's own
  `SqliteAdapter`/`Introspector`/`QueryCompiler`; only the driver is custom). The
  `CamelCasePlugin` maps snake_case columns ↔ camelCase domain fields, so repos
  have no hand-written row mappers (except `turns`, which JSON-parses `usageJson`).
  Repo functions are **async** (Kysely returns Promises) — `await` them.
  Multi-statement DDL runs once on the raw `DatabaseSync` before the Kysely wrap.
  Kysely is bundled into `main.js` (pure JS, no CLI), not externalized like the SDKs.
- **Build tool:** `vite-plugin-electron@1.x` (latest; required for Vite 8 /
  rolldown). `electron-vite` is unrelated and only supports up to Vite 7.
- **Svelte 5 reactivity:** after pushing an object into a `$state` array, mutate
  the proxy you read *back out* of the array (`turns[i]`), not the original
  literal — mutating the literal does not trigger updates. Self-assignment
  (`x = x`) does not force a refresh in runes mode.
- **SDK `options.env` replaces the subprocess environment wholesale** (it is not
  merged). Always spread `...process.env` when setting it, or the subprocess
  loses `PATH` / API keys.
- Both engines run **read-only** for v1 (Claude: `Read`/`Glob`/`Grep` +
  `bypassPermissions`; Codex: `sandboxMode: "read-only"`). Adding write tools
  requires a permission flow (Claude `canUseTool`, Codex approval policy) and a
  permission UI.

## Packaging note

`dist-electron/` is gitignored (build output). The SDK spawns `node` from
`PATH`, which is fine for dev; a packaged app needs a bundled Node runtime (or
an explicit `executable` / `pathToClaudeCodeExecutable`) plus an installer.

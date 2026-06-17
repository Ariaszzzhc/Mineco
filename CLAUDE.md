# CLAUDE.md

Guidance for working in this repository.

## What this is

A minimal **Electron + Svelte 5 + Vite 8** desktop **agent host**: it provides a
unified desktop workbench for Claude Agent SDK, managing sessions, credentials,
agents, MCP servers, skills, and per-workspace memory across a single client.
The user picks a workspace and agent per turn; the agent runs in an isolated
`CLAUDE_CONFIG_DIR`, and the host assembles context (global instructions, MCP,
skills, memory) from a three-level scope hierarchy (local > project > global).
The goal is a small, correct end-to-end flow for coding tasks, not a
feature-complete product.

## Architecture

The Claude Agent SDK requires Node.js (spawns a CLI subprocess), so it runs
**only in the Electron main process**. The renderer (Svelte) is a thin client
that talks to the main process over IPC. mineco is **single-engine** (Claude)
this cycle; the engine abstraction (types, adapter pattern) is preserved for
future engines.

```
electron/main.ts            Main process: window + IPC surface
electron/preload.ts         contextBridge -> window.mineco (agents/workspaces/sessions/runTurn)
electron/session-runner.ts  Orchestrates one turn: get-or-open live session, persist, stream
electron/engines/           Engine abstraction: types.ts (Engine + EngineSession + NormalizedEvent),
                            claude.ts (persistent-session adapter), async-queue.ts (pushable stream)
electron/services/          Business logic layer:
                              agent.ts (agent dir contract + model mapping)
                              workspace.ts (workspace switching + state)
                              scope.ts (three-level scope merging for MCP/Skills)
                              mcp.ts (MCP server config + status)
                              skills.ts (Skill directory scanning)
                              memory.ts (per-workspace memory injection)
                              context-assembly.ts (inject global instructions + memory + MCP + Skills)
                              run-registry.ts (in-flight session state)
                              engine-sessions.ts (live persistent EngineSession per mineco session)
electron/db/                Kysely-on-node:sqlite: workspaces/sessions/turns/messages
                            (config lives in files, not DB)
src/lib/agent-protocol.ts   Shared domain model + NormalizedEvent + IPC channels
src/App.svelte              Renderer: three-view shell (Home/Session/Settings) + sidebar
src/main.ts                 Renderer entry (mounts App)
index.html                  Renderer HTML (+ CSP)
```

**Two-axis model** (core architecture):
- **Engine axis**: each Agent = `~/.mineco/engines/claude/<id>/` (CLAUDE_CONFIG_DIR),
  containing `agent.json` + `settings.json` (token, Base URL, model aliases, etc.).
  Each Agent runs isolated, not touching user's `~/.claude`.
- **Workspace axis**: each workspace = a local directory (or null for shared),
  carrying `.mcp.json`, `.claude/skills/`, `.mineco/memory/`, per-workspace last mode + agent.

Flow: renderer → `window.mineco.runTurn()` → preload IPC → `session-runner`
picks current workspace + agent (from request or workspace.lastAgentId),
calls `context-assembly` to merge MCP/Skills/memory from three scopes,
invokes Claude adapter with isolated `CLAUDE_CONFIG_DIR`, streams
`NormalizedEvent`s back on per-request channel → preload forwards to callback.

**Persistent session model:** each mineco session maps to ONE long-lived
Claude `query()` (a warm native subprocess) held in `engine-sessions.ts`, driven
with a streaming-input prompt. Each turn pushes a user message into that
persistent input stream and consumes events until the turn's terminal `result`
(which ends the *turn*, NOT the query); per-turn `model`/`permissionMode` are
applied via the SDK's `setModel`/`setPermissionMode` control requests. Stop =
`interrupt()` (session stays warm); the query is torn down only on session
delete / agent switch / app quit. A turn NEVER closes the input stream — doing
so was the original bug (the SDK keeps the transport open until the input
iterable ends, so the runner hung and never persisted the assistant message).

**Opening a session (resume vs seed):** the canonical transcript lives in SQLite
(`messages`). A session is bound to one agent (its `CLAUDE_CONFIG_DIR` is fixed).
On first turn / cold reopen with the **same agent** + a prior `nativeThreadId` →
native `resume`; **different agent** (or no thread) → open a fresh query and seed
its first prompt with the prior transcript via `buildFirstPrompt`. Switching
agents closes the old query and opens a new one — always clean isolation.

**Per-session context:** global instructions + memory + MCP are assembled once,
when the session's query is opened (fixed for its lifetime, like a real Claude
session) — NOT re-assembled per turn. Reopen the session to pick up changes.

## Commands

- `pnpm dev` — Vite + Electron with HMR (primary workflow)
- `pnpm build` — builds renderer (`dist/`) and main+preload (`dist-electron/`)
- `pnpm check` — `svelte-check` + `tsc` (run before committing)
- `pnpm lint` / `pnpm format` — Biome

**Data layout**:
- **Runtime state** (canonical transcript, sessions, turns) → SQLite `~/.mineco/mineco.db`.
- **Configuration** (agents, MCP, skills, memory, global instructions) → files under
  `~/.mineco/` and per-workspace directories (`.mcp.json`, `.claude/skills/`, `.mineco/memory/`, etc.).
- **Agent credentials** (token, Base URL) → each agent's isolated `~/.mineco/engines/claude/<id>/settings.json` (plaintext, not shared, not in git).
- **Global instructions** → `~/.mineco/MINECO.md` (appended to system prompt when the session's query is opened).
- **Per-workspace memory** → `<workspace>/.mineco/memory/` (injected via system prompt append).
- **Three-level MCP/Skills scopes**: global (`~/.mineco/mcp.json`, `~/.mineco/skills/`) /
  project (`.mcp.json`, `.claude/skills/`, git-tracked) / local (`.mcp.local.json`,
  `.mineco/skills/`, not git-tracked). mineco merges all three (local > project > global)
  and injects programmatically; SDL never reads project or local scopes directly.

## Conventions & gotchas

- **Claude Agent SDK is main-process only.** Never import it in renderer code.
- **Engine abstraction:** `Engine` interface (`types.ts`) defines `capabilities()`
  and `openSession()`, which returns a persistent `EngineSession` (`runTurn` /
  `interrupt` / `close`) that maps the native SDK to `NormalizedEvent`s. Claude
  adapter is the v1 implementation. Future engines: new adapter in
  `electron/engines/`, new type branches in `NormalizedEvent`,
  done—renderer/IPC/persistence unchanged.
- **Agent isolation:** each Agent has its own `CLAUDE_CONFIG_DIR`
  (`~/.mineco/engines/claude/<id>/`). Never set `CLAUDE_CONFIG_DIR` globally or
  to `~/.claude`; mineco must not pollute user's Claude Code environment.
- **Services layer:** business logic lives in `electron/services/`
  (`agent.ts`, `workspace.ts`, `scope.ts`, `mcp.ts`, `skills.ts`, `memory.ts`,
  `context-assembly.ts`, `run-registry.ts`). `session-runner` consumes their
  outputs; keep it clean and testable.
- **Security baseline** (do not weaken): `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`. Renderer reaches Node only
  through the narrow preload bridge.
- **Preload must be CommonJS** (`dist-electron/preload.cjs`). Vite/rolldown's
  default emits a CJS file with an `.mjs` extension under `"type": "module"`,
  which crashes — `vite.config.ts` overrides `entryFileNames` to `.cjs`.
- **`main` build externalizes Claude SDK** (`rolldownOptions.external` —
  note: Vite 8 uses `rolldownOptions`, not `rollupOptions`). The SDK resolves
  its own bundled CLI/assets at runtime.
- **Persistence is `node:sqlite`** (built into Node 24 bundled with Electron 42;
  no native module rebuild needed). Fallback if disabled: `better-sqlite3` +
  `electron-rebuild`.
- **Kysely over inlined dialect** (`db/node-sqlite-dialect.ts`): stock Kysely
  targets `better-sqlite3`, so we wrap `DatabaseSync` ourselves. `CamelCasePlugin`
  maps snake_case ↔ camelCase. Repo functions are **async** (Promises); `await`
  them. Kysely is bundled (pure JS), not externalized.
- **Build tool:** `vite-plugin-electron@1.x` (required for Vite 8 / rolldown).
  `electron-vite` only supports Vite 7.
- **Svelte 5 reactivity:** after pushing into a `$state` array, mutate the proxy
  you read *back out* (`arr[i]`), not the original literal. Self-assignment
  (`x = x`) does not force refresh in runes mode.
- **SDK `options.env` replaces wholesale** (not merged). Always spread
  `...process.env`, or subprocess loses `PATH` / API keys.
- **Write tool permissions:** read-only for v1. Adding write tools requires
  `canUseTool` callback (approval flow) + UI. See `session-runner`
  (`onApproval` bridge).

## Packaging & distribution

`dist-electron/` is gitignored (build output). The SDK spawns `node` from `PATH`
(fine for dev). A packaged app needs a bundled Node runtime (or explicit
`executable` / path) plus an installer (`electron-builder`).

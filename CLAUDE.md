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
src/main/index.ts            Main process: window + IPC surface
src/preload/index.ts         contextBridge -> window.mineco (agents/workspaces/sessions/runTurn)
src/main/session-runner.ts   Orchestrates one turn: get-or-open live session, persist, stream
src/main/engines/            Engine abstraction: types.ts (Engine + EngineSession + NormalizedEvent),
                             claude.ts (persistent-session adapter), async-queue.ts (pushable stream)
src/main/services/           Business logic layer:
                               agent.ts (agent dir contract + model mapping)
                               workspace.ts (workspace switching + state)
                               scope.ts (three-level scope merging for MCP/Skills)
                               mcp.ts (MCP server config + status)
                               skills.ts (Skill directory scanning)
                               memory.ts (per-workspace memory injection)
                               context-assembly.ts (inject global instructions + memory + MCP + Skills)
                               run-registry.ts (in-flight session state)
                               engine-sessions.ts (live persistent EngineSession per mineco session)
src/main/db/                 Kysely-on-node:sqlite: workspaces/sessions/turns/messages
                             (config lives in files, not DB)
src/shared/agent-protocol.ts Shared domain model + NormalizedEvent + IPC channels (imported by BOTH processes)
src/renderer/App.svelte      Renderer: three-view shell (Home/Session/Settings) + sidebar
src/renderer/main.ts         Renderer entry (mounts App)
index.html                   Renderer HTML (+ CSP)
```

**Source layout** (process-role, under one `src/`): `src/main/` (Electron main
process, Node), `src/preload/` (contextBridge), `src/renderer/` (Svelte client),
`src/shared/` (cross-process domain model — `agent-protocol.ts`, imported by both
main and renderer). The `@/` alias (configured in `vite.config.ts` + both
`tsconfig.*.json`, via `paths` with **no `baseUrl`** — TS 6 deprecates it) maps to
`src/`, so prefer `@/shared/agent-protocol` over deep `../../` relative paths;
sibling (`./`) imports stay relative.

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
  `src/main/engines/`, new type branches in `NormalizedEvent`,
  done—renderer/IPC/persistence unchanged.
- **Agent isolation:** each Agent has its own `CLAUDE_CONFIG_DIR`
  (`~/.mineco/engines/claude/<id>/`). Never set `CLAUDE_CONFIG_DIR` globally or
  to `~/.claude`; mineco must not pollute user's Claude Code environment.
- **Services layer:** business logic lives in `src/main/services/`
  (`agent.ts`, `workspace.ts`, `scope.ts`, `mcp.ts`, `skills.ts`, `memory.ts`,
  `context-assembly.ts`, `run-registry.ts`, `cli-binary.ts`). `session-runner`
  consumes their outputs; keep it clean and testable.
- **Security baseline** (do not weaken): `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`. Renderer reaches Node only
  through the narrow preload bridge.
- **Preload must be CommonJS** (`dist-electron/preload.cjs`). Vite/rolldown's
  default emits a CJS file with an `.mjs` extension under `"type": "module"`,
  which crashes — `vite.config.ts` hardcodes `entryFileNames: "preload.cjs"`.
  The entry moved to `src/preload/index.ts`, so the output name is pinned
  explicitly (not derived from `[name]`); `dist-electron/main.js` is pinned the
  same way for `src/main/index.ts`, keeping `package.json`'s `"main"` stable.
- **`main` build externalizes Claude SDK** (`rolldownOptions.external` —
  note: Vite 8 uses `rolldownOptions`, not `rollupOptions`). The SDK's JS
  (`sdk.mjs`) stays in `node_modules` and is loaded at runtime.
- **The engine binary is the native CLI, NOT `node cli.js`.** The SDK spawns a
  self-contained native executable (`claude` / `claude.exe`, ~235 MB Bun build)
  **directly** — `node` is only prefixed when the executable is a `.js` script
  (legacy SDK). So a packaged app needs **no bundled Node runtime** for the
  engine. The binary ships as 8 per-platform npm optional deps
  (`@anthropic-ai/claude-agent-sdk-<variant>`); mineco does **not** bundle them.
- **On-demand binary provisioning** (`services/cli-binary.ts`): instead of
  bundling the ~235 MB binary, mineco downloads the host's variant from the npm
  registry on first session open and caches it at `~/.mineco/.bin/<version>/`.
  `session-runner` `await ensureClaudeCli()` before `openSession`, then passes
  the path via `EngineSessionInit.cliExecutablePath` → the Claude adapter's
  `options.pathToClaudeCodeExecutable` (which **bypasses** the SDK's own
  optional-package resolver). Provisioning self-verifies: tarball sha512
  (registry `dist.integrity`) + extracted-binary sha256/size (the SDK's bundled
  `manifest.json`, version-locked). Extraction is a pure-Node gunzip + ustar
  parser (no deps, streams the body to disk). Registry override:
  `MINECO_CLI_REGISTRY` / `npm_config_registry` (default `registry.npmjs.org`).
- **Persistence is `node:sqlite`** (built into Node 24 bundled with Electron 42;
  no native module rebuild needed). Fallback if disabled: `better-sqlite3` +
  `electron-rebuild`.
- **Kysely over inlined dialect** (`src/main/db/node-sqlite-dialect.ts`): stock Kysely
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

Config lives in **`electron-builder.yml`**; `dist-electron/` and `release/` are
gitignored (build output). Scripts: `pnpm pack` (→ `release/<version>/*-unpacked/`,
a fast smoke test) and `pnpm dist` (→ installers). Both run `vite build` first —
`vite-plugin-electron` only emits `dist-electron/`, it doesn't package. The app
manifest stays `dist-electron/main.js` (package.json `main`); renderer loads from
`dist/` via `loadFile` when `VITE_DEV_SERVER_URL` is absent.

The engine no longer needs a bundled Node runtime — the SDK spawns a native
binary directly (see the gotchas above). The packaging strategy is therefore:

- **Do NOT bundle the native binary.** The `files` negative glob
  `!**/node_modules/@anthropic-ai/claude-agent-sdk-*/**` drops all platform
  variants (note: `claude-agent-sdk-*` with the trailing dash matches the
  variants but NOT the JS SDK `claude-agent-sdk`). On a given host only the
  matching variant is even installed (~235 MB); it's fetched at runtime by
  `services/cli-binary.ts` into `~/.mineco/.bin/`. Verified: `win-unpacked` is
  ~390 MB (Electron runtime) with no `claude-agent-sdk-*` dir anywhere — ~235 MB
  smaller than bundling it (and dodges signing the binary, which is already
  Anthropic-signed in the user dir with no macOS quarantine xattr).
- **Keep + unpack the SDK JS.** `asarUnpack: node_modules/@anthropic-ai/claude-agent-sdk/**`
  keeps `sdk.mjs` / `manifest.json` readable on disk (the latter is how
  `cli-binary.ts` verifies the download) and lets the SDK spawn its subprocess
  without asar path translation. The rest of `node_modules` stays in `app.asar`.
- **pnpm + electron-builder:** `.npmrc` sets `node-linker=hoisted` so the builder
  can collect a flat `node_modules` (the default symlinked layout trips it up).
  Changing the linker requires a fresh `pnpm install`. (`npx`/npm warns
  "Unknown project config node-linker" — harmless; it's a pnpm-only key.)
- **No app icon yet** — electron-builder falls back to the default Electron icon
  (a warning, not an error). Add `build/icon.{ico,icns,png}` to brand it.
- **First run needs network** to fetch the binary; offline/air-gapped installs
  need a fallback (ship the binary manually / point at a pre-staged path).
- Per-platform installers must be built on (or cross-built for) each OS;
  binaries can't be cross-compiled.

**Auto-update (electron-updater):** `electron-builder.yml`'s `publish` block
(GitHub provider) makes the build embed `app-update.yml` and emit the
`latest*.yml` feeds next to the installers — CI uploads those (plus the mac
`*.zip`) onto the GitHub Release via `gh release`, so updates resolve even though
electron-builder itself runs `--publish never`. `services/updater.ts` wraps
`autoUpdater` (externalized in `vite.config.ts`, like the SDK; it reads its own
`app-update.yml` and Node deps at runtime): `autoDownload = false` →
manual-but-guided flow (check → download-with-progress → quit-and-install),
projected onto the shared `UpdateState` and broadcast to the renderer
(`CH.updatesChanged`), surfaced in the Settings → Appearance "Updates" card. The
install IPC handler flips `isQuitting` first, else the close-to-tray handler
vetoes the installer's quit. Guarded by `app.isPackaged` (`supported`), so dev is
a no-op. **macOS self-update needs a *signed* build** — the unsigned CI artifacts
install fine but can't auto-update until `mac` signing is configured (the `zip`
target is already there for Squirrel.Mac).

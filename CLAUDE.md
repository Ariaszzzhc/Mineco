# CLAUDE.md

Guidance for working in this repository.

## What this is

A minimal **Electron + Svelte 5 + Vite 8** desktop agent built on the
[Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk).
The goal is a small, correct end-to-end flow — prompt in, streamed agent output
on screen — not a feature-complete product.

## Architecture

The Agent SDK requires Node.js (it spawns a CLI subprocess), so it runs **only
in the Electron main process**. The renderer (Svelte) is a thin client that
talks to the main process over IPC.

```
electron/main.ts            Main process: window, IPC handler, runs query()
electron/preload.ts         contextBridge -> window.agent.run(prompt, onEvent)
src/lib/agent-protocol.ts   Shared IPC types + channel helpers (both sides import this)
src/App.svelte              Renderer: minimal chat UI (Svelte 5 runes)
src/main.ts                 Renderer entry (mounts App)
index.html                  Renderer HTML (+ CSP)
```

Flow: renderer calls `window.agent.run()` → preload `ipcRenderer.send` on
`agent:run` → main runs `query()` and streams `AgentEvent`s back on a
per-request channel (`agent:event:<id>`) → preload forwards to the callback.

## Commands

- `pnpm dev` — Vite + Electron with HMR (primary workflow)
- `pnpm build` — builds renderer (`dist/`) and main+preload (`dist-electron/`)
- `pnpm check` — `svelte-check` + `tsc` (run before committing)
- `pnpm lint` / `pnpm format` — Biome

Set `ANTHROPIC_API_KEY` in the environment before launching; the SDK reads it.

## Conventions & gotchas

- **Agent SDK is main-process only.** Never import it in renderer code.
- **Security baseline** (do not weaken): `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`. The renderer reaches Node only
  through the narrow preload bridge.
- **Preload must be CommonJS** (`dist-electron/preload.cjs`). Vite/rolldown's
  default emits a CJS file with an `.mjs` extension under `"type": "module"`,
  which crashes — `vite.config.ts` overrides `entryFileNames` to `.cjs`.
- **`main` build externalizes the SDK** (`rolldownOptions.external` — note: on
  Vite 8 it's `rolldownOptions`, not `rollupOptions`). The SDK resolves its own
  bundled CLI/assets at runtime, so it must not be bundled.
- **Build tool:** `vite-plugin-electron@1.x` (latest; required for Vite 8 /
  rolldown). `electron-vite` is unrelated and only supports up to Vite 7.
- **Svelte 5 reactivity:** after pushing an object into a `$state` array, mutate
  the proxy you read *back out* of the array (`turns[i]`), not the original
  literal — mutating the literal does not trigger updates. Self-assignment
  (`x = x`) does not force a refresh in runes mode.
- **SDK `options.env` replaces the subprocess environment wholesale** (it is not
  merged). Always spread `...process.env` when setting it, or the subprocess
  loses `PATH` / API keys.
- The agent is intentionally read-only (`Read`, `Glob`, `Grep`) with
  `permissionMode: "bypassPermissions"`. Adding write tools requires a
  `canUseTool` handler and a permission UI.

## Packaging note

`dist-electron/` is gitignored (build output). The SDK spawns `node` from
`PATH`, which is fine for dev; a packaged app needs a bundled Node runtime (or
an explicit `executable` / `pathToClaudeCodeExecutable`) plus an installer.

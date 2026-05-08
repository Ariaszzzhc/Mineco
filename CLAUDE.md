# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mineco is a Node.js-first agent runtime and local coding agent, currently in Phase 0 design. The project name is **Mineco**; "Electrolyte" is only the 0.3 version codename and must not be used as project name, CLI name, or workspace directory name. Phase 0 uses a REPL-style terminal entry point, with TUI planned for later phases.

The canonical documentation is in Chinese. All design docs live under `docs/` — start from `docs/README.md`.

## Build & Development Commands

This project uses pnpm + Turborepo monorepo. No source code exists yet on this branch — the repo is currently design documents only.

Once code lands, commands will be:

- `pnpm build` — turbo run build
- `pnpm check` — turbo run check (TypeScript type checking)
- `pnpm lint` — biome check .
- `pnpm lint:fix` — biome check --fix .
- `pnpm format` — biome format --fix .
- `pnpm test` — vitest run
- `pnpm dev` — turbo run dev (with --filter to scope packages)

## Tech Stack

- **Runtime**: Node.js 25+, TypeScript strict mode
- **Package manager**: pnpm (v10.29.3), workspace scope `packages/*`
- **Monorepo**: Turborepo for task graph orchestration
- **Linting/Formatting**: Biome (not ESLint/Prettier). Root `biome.json` is source of truth. Double quotes, semicolons, space indentation.
- **Testing**: Vitest
- **Schema**: Zod
- **Database**: SQLite via `node:sqlite`, Kysely as query builder/migration layer. Project inlines a custom Kysely `node:sqlite` dialect in `packages/runtime/src/store/kysely-node-sqlite/`.
- **Concurrency**: Effect for structured concurrency, resource scoping, typed errors, and DI inside runtime. Public SDK stays plain Promise/AsyncIterable — never expose Effect types externally.
- **Logging**: LogTape (`@logtape/logtape`). Effect fibers log through a custom LogTape bridge layer, never through Effect's built-in loggers.
- **Provider**: OpenAI-compatible Chat Completions (Phase 0)

## Architecture

### Layered Design

```
REPL / TUI (product surface) → Runtime SDK → Agent Core → Provider/Tool/Store interfaces
```

Key boundaries with strict dependency rules:
- **Agent Core** — session lifecycle, run loop, context prep, provider invocation, tool orchestration. Depends on protocol types, never on provider SDKs.
- **Provider Adapter** — maps `RunStepInput` to vendor request, maps response stream to `RunEvent`. Never executes tools, never reads workspace files, never makes approval decisions.
- **Tool Runtime** — the only tool execution boundary. All tools (built-in, MCP, skill scripts) must go through it: validate → canonicalize → policy check → approval → execute → redact output.
- **State Store** — SQLite via Kysely. Append-only items/events. `RuntimeStore` exposes Effect services internally; SDK boundary converts to Promise.
- **Protocol** (`packages/protocol`) — provider-neutral types and schemas. Cannot depend on Effect, Kysely, `node:sqlite`, provider SDKs, or any UI package.

### Dependency Direction (allowed)

```
repl/tui → runtime sdk → agent core → provider/tool/store interfaces
agent core → protocol
tool runtime → protocol + store + tool implementations
provider adapter → protocol + provider SDK
```

Forbidden: provider adapter → tool runtime/repl, tool implementation → repl, protocol → runtime implementation, store → repl.

### Module Dependency Direction

```
repl/tui → runtime sdk → agent core → provider/tool/store interfaces
agent core → protocol
tool runtime → protocol + store + tool implementations
provider adapter → protocol + provider SDK
```

### Key Concepts

- **AgentDefinition** — versionable agent config (instructions, model, skills, tools, policy)
- **RuntimeSession** — one task execution state container; transcript is source of truth
- **AgentRun** — a resumable execution segment within a session. Run-level states (`waiting_for_tool`, `waiting_for_approval`, `cancelling`) belong to `RunStatus` only, never to `RuntimeSessionStatus`.
- **RuntimeEvent** — dot-notation event names (e.g., `tool.started`, `approval.requested`). Product surface renders events only.
- **InstructionBlock** — ordered, auditable instruction chunks with priority, not a single prompt string.

### Store Schema

Database: `packages/runtime/src/store/schema.ts`
Migrations: `packages/runtime/src/store/migrations/`

Tables: sessions, runs, items, runtime_events, provider_events, approvals, artifacts, migrations. JSON fields stored as `string` in DB, encode/decode at Store boundary.

### File Naming

- Files: kebab-case (`tool-runtime.ts`)
- Types/Classes: PascalCase
- Functions/variables: camelCase
- Tool names: dot namespace (`file.read`, `shell.run`)
- Event names: dot notation (`tool.started`, `approval.requested`)

## Documentation Map

- `docs/README.md` — documentation index, start here
- `docs/architecture/agent-runtime-design.md` — long-term runtime architecture and design decisions
- `docs/architecture/technology-stack.md` — tech stack usage rules (Biome, Turborepo, Kysely, Effect, LogTape)
- `docs/protocol/agent-runtime-protocol.md` — provider-neutral execution protocol
- `docs/roadmap/phase-0-local-agent-execution.md` — Phase 0 scope and acceptance criteria
- `docs/process/development-workflow-and-standards.md` — engineering rules, code standards, review criteria, phase gates

## Important Rules

- Effect types must never leak to public SDK or REPL. Use `Effect.runPromise` at the boundary.
- LogTape is the only diagnostic log backend. Effect fibers bridge through `Logger.replace(Logger.defaultLogger, makeEffectLogTapeLogger(...))`.
- Business code must not use `node:sqlite` directly — only through Kysely, except inside the inlined dialect at `packages/runtime/src/store/kysely-node-sqlite/`.
- Large outputs go to artifacts; model sees only summary/tail errors. Never stuff large content into transcript.
- Every tool must go through ToolRuntime: schema validation → path canonicalization → policy → approval → execute → redact.
- Secrets never enter transcript, RuntimeEvent, or logs. Model sees capability facts only.
- `sessions.status` must not contain run intermediate states. Run states live on `runs.status`.
- Runtime terminal events are exactly one of: `run.completed`, `run.failed`, `run.cancelled`.
- Config sources have trust levels: `policy` > `cli_override` > `user_global` > `workspace_local` > `workspace_shared` > `builtin`. Lower-trust sources cannot expand dangerous permissions.

<p align="center">
  <img src="build/icon.png" alt="Mineco" width="128" height="128">
</p>
<h1 align="center">Mineco</h1>
<p align="center">A native desktop agent host for the Claude Agent SDK.</p>
<p align="center">
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="#getting-started">Getting Started</a>
</p>

---

> **Warning:** This project is under rapid development. APIs and internal structures may change without notice.

## What is Mineco?

Mineco is a native desktop app that hosts the **Claude Agent SDK** — the same engine behind Claude Code — in a unified workbench. Manage agents, workspaces, MCP servers, skills, and per-workspace memory from a single window. Pick a workspace and an agent, and the host assembles the right context for every turn.

Open a folder. Pick an agent. Start a session.

## Features

- **Powered by the Claude Agent SDK** — runs the real native Claude Code engine, streamed into a desktop UI.
- **Isolated agents** — each agent has its own config dir, credentials (token / base URL), and model aliases. Switch agents per turn without ever touching your `~/.claude`.
- **Workspace-centric** — point a workspace at a project directory; sessions, MCP, skills, and memory all scope to it.
- **MCP servers** — three-level scopes (global / project / local) merged and injected automatically.
- **Skills** — directory-based skills across the same three scopes.
- **Per-workspace memory** — persistent notes injected into the agent's context.
- **Persistent sessions** — each session is one warm engine query; the full transcript lives in SQLite and resumes across reopens.
- **Live streaming** — text, extended thinking, and tool calls stream in real time; assistant output renders as Markdown with syntax highlighting.
- **No heavyweight bundle** — the ~235 MB native engine binary isn't shipped; it's downloaded and checksum-verified on first run.
- **Secure by default** — context isolation, sandboxed renderer, no Node access in the UI layer.

## Getting Started

### Prerequisites

- Node.js >= 22
- pnpm 10.29

### Install & Run

```bash
pnpm install
pnpm dev
```

Create an agent and paste your Anthropic credentials in **Settings**, open a folder, and start a session. The first run downloads the engine binary into `~/.mineco`.

### Build

```bash
pnpm dist
```

Produces installers under `release/` via electron-builder. The native engine binary is fetched on first launch rather than bundled — see [`CLAUDE.md`](CLAUDE.md) for the packaging details.

## License

MIT

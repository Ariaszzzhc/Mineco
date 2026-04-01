<p align="center">
  <img src="mineco.png" alt="Mineco" width="128" height="128">
</p>
<h1 align="center">Mineco</h1>
<p align="center">A native desktop AI coding agent.</p>
<p align="center">
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="#getting-started">Getting Started</a>
</p>

---

> **Warning:** This project is under rapid development. APIs and internal structures may change without notice.

## What is Mineco?

Mineco is a native desktop app that puts an AI coding agent directly in your project. It reads your files, writes code, runs commands — all from a single window.

Open a folder. Start building.

## Features

- **File operations** — The agent reads and writes files in your workspace directly. Not suggestions — actual changes.
- **Shell execution** — Run commands, see output, diagnose errors, and fix them in the same conversation.
- **Extended thinking** — Watch the agent reason step-by-step before making changes.
- **Subagents** — Spawn child agents to handle subtasks in parallel. Each subagent runs independently with its own context and step limit.
- **Streaming responses** — Real-time streaming with SSE. See text, tool calls, and results as they happen.
- **Auto session titles** — AI-generated session titles based on your first message.
- **Rich rendering** — Markdown with syntax highlighting (Shiki), collapsible thinking blocks, and tool call cards.
- **Provider system** — Supports any OpenAI-compatible API. Built-in support for Zhipu AI. Add custom providers with your own endpoints and models.
- **Workspace-centric** — Sessions and configs are scoped to your project directory.
- **Desktop + Web** — Run as a native Tauri desktop app, or launch in web mode and access from any browser.

## Getting Started

### Prerequisites

- Node.js >= 25
- pnpm 10.29

### Install & Run

```bash
pnpm install && pnpm start
```

Add your API key in **Settings**, open a folder, and start coding.

## License

MIT

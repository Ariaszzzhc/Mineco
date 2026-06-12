<p align="center">
  <img src="mineco.png" alt="Mineco" width="128" height="128">
</p>
<h1 align="center">Mineco</h1>
<p align="center">A native macOS AI coding agent.</p>
<p align="center">
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="#getting-started">Getting Started</a>
</p>

---

> **Note:** Mineco is being rewritten from scratch. See
> [`docs/PRD.md`](docs/PRD.md) and [`docs/technical-design.md`](docs/technical-design.md)
> for the v1 design. The `backup/` directory holds the previous codebase for
> reference only.

## What is Mineco?

Mineco is a native macOS app that puts an AI coding agent directly in your
project. It reads your files, writes code, runs commands — all from a single
native window, with multiple sessions running in parallel and explicit approval
for dangerous operations.

The agent engine is Anthropic's `claude-agent-sdk`; Mineco is the native shell,
the connection/account management, and the safety + cost controls around it.

## Architecture (v1)

- **`macos/Mineco/`** — native SwiftUI app, a _thin client_. Renders the
  conversation and forwards user intent over JSON-RPC. No business logic.
- **`packages/core/`** — the single Deno process (`mineco-core`). Owns all
  business logic, drives the SDK, and is the sole writer to SQLite.
- **`packages/protocol/`** — the JSON-RPC wire contract (zod + TS), the shared
  source of truth for both sides.
- **Transport:** newline-delimited JSON-RPC 2.0 over stdio (no ports, no
  handshake).

## Getting Started

### Prerequisites

- [Deno](https://deno.com) 2.7+
- Xcode (for the macOS app, when added)

### Develop (core)

```bash
deno test        # unit tests (protocol + core)
deno lint
deno fmt
deno check packages
```

The macOS SwiftUI project (`macos/`) is added in a later step.

## License

MIT

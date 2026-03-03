# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Manong is a desktop AI coding assistant built with Electron Forge, Vite, React, and TypeScript. It uses the Anthropic API for AI capabilities and supports extending tools via Model Context Protocol (MCP).

## Commands

```bash
pnpm start          # Run the app in development mode
pnpm run lint       # Run ESLint on .ts/.tsx files
pnpm run package    # Package the app for distribution
pnpm run make       # Create distributable installers
```

No test framework is configured.

## Architecture

### Electron Multi-Process

- **Main Process** (`src/main.ts`) — Node.js environment; window creation, IPC, agent loop, tool execution, MCP management
- **Preload Script** (`src/preload.ts`) — contextBridge API exposing `window.manong`
- **Renderer Process** (`src/renderer/`) — React UI with Zustand state management and Tailwind CSS

### Workspace-Centric Data Model

The app is organized around workspaces (directories), not sessions:

```
Workspace (directory path)
├── path: string           # Unique identifier
├── name: string           # Display name
└── lastOpenedAt: number
```

- `StorageService` persists workspaces and sessions via electron-store
- Sessions are scoped to workspaces, not global
- Recent workspaces tracked (max 10)

### Core Modules

```
src/
├── shared/               # Types shared between processes
│   ├── types.ts          # Message, Part, Session, Workspace, StreamEvent, AppConfig
│   ├── mcp-types.ts      # MCP config, connection status, server status types
│   ├── agent-types.ts    # Agent status & state types
│   ├── tool.ts           # ToolDefinition interface, defineTool()
│   └── ipc.ts            # IPC_CHANNELS constants
│
├── main/
│   ├── ipc/              # IPC handlers (workspace, session, agent, config, MCP, skills)
│   └── services/
│       ├── agent/
│       │   ├── loop.ts       # AgentLoop — orchestrates agent with system prompt & streaming
│       │   └── executor.ts   # AgentExecutor — streaming + tool execution (max 50 steps)
│       ├── provider/
│       │   └── anthropic.ts  # AnthropicProvider — streaming API integration
│       ├── tools/            # Tool registry + builtin tools
│       ├── mcp/              # MCP integration (manager, connection, tool adapter, config)
│       ├── skill/            # Skill system (loader, parser, builtins)
│       └── storage.ts        # StorageService — electron-store persistence
│
├── preload.ts            # Exposes window.manong API
│
└── renderer/
    ├── App.tsx           # Root component with navigation-view layout
    ├── stores/app.ts     # Zustand store (~50 actions, handles all app state)
    ├── components/       # UI components (ChatPanel, Sidebar, NavigationBar, etc.)
    └── themes/tokens.ts  # Light/dark CSS variable token definitions
```

### Agent Loop

`AgentLoop` (`src/main/services/agent/loop.ts`) manages a single agent execution per window:
- Contains the system prompt (~110 lines) with instructions for tool use and output formatting
- Delegates streaming execution to `AgentExecutor` which handles the Anthropic API call loop
- Max 50 tool execution steps per run
- Streams events to renderer: `text_delta`, `thinking_delta`, `tool_call`, `tool_result`, `usage`, `end`, `error`

### Tool System

Tools use a dual-source registry pattern (`src/main/services/tools/registry.ts`):

**Builtin tools (9):** `read_file`, `write_file`, `edit_file`, `list_dir`, `search_file`, `run_shell`, `skill`, `ask`, `todo`

**MCP tools:** Dynamically registered from connected MCP servers via `tool-adapter.ts`

Tools are defined with Zod schemas:

```typescript
export const myTool = defineTool({
  name: 'tool_name',
  description: 'What the tool does',
  parameters: z.object({ param: z.string().describe('Description') }),
  execute: async (params, context: ToolContext) => {
    // context.workingDir is the current workspace path
    return { success: true, output: 'result' };
  },
});
toolRegistry.register(myTool);
```

### MCP Integration

`src/main/services/mcp/` provides Model Context Protocol support:

- **Layered configuration:** global (`~/.config/manong/`) + project (`.manong/`) configs merged together
- **MCPManager** — server lifecycle, tool registration, workspace-aware config switching
- **MCPConnection** — stdio and HTTP transports with auto-reconnect
- **Tool adapter** — converts MCP tool schemas to the internal `ToolDefinition` format

### Skill System

`src/main/services/skill/` loads markdown-based skill definitions from three sources: builtin, global (`~/.config/manong/skills/`), and project (`.manong/skills/`). Skills are executable via the `skill` tool or the command palette (Ctrl+Shift+P).

### Navigation & UI

The renderer uses a navigation-view pattern (not a router):
- `activeView` state switches between `'chat'`, `'mcp'`, and `'settings'` views
- `NavigationBar` — vertical icon buttons on the left
- `Sidebar` — persistent workspace/session list
- `ChatPanel` — main content area with message stream

### IPC API (window.manong)

```typescript
// Agent
window.manong.agent.start(sessionId, message, providerConfig, workspacePath)
window.manong.agent.stop()
window.manong.agent.onStream(callback)

// Workspace
window.manong.workspace.open()           // Opens folder picker
window.manong.workspace.openPath(path)   // Opens specific path
window.manong.workspace.getCurrent()
window.manong.workspace.getRecent()
window.manong.workspace.removeRecent(path)

// Session
window.manong.session.create()
window.manong.session.list()
window.manong.session.get(sessionId)
window.manong.session.delete(sessionId)
window.manong.session.update(session)

// Config, File System, Window, Skills, Questions, MCP — see src/preload.ts
```

## Build Configuration

Three separate Vite configs (`vite.main.config.ts`, `vite.preload.config.ts`, `vite.renderer.config.ts`). Electron Forge configured in `forge.config.ts` with security fuses (RunAsNode disabled, ASAR integrity enabled, cookie encryption enabled).

## Tech Stack

- **UI**: React 19 + Zustand 5 + Tailwind CSS 3
- **AI**: @anthropic-ai/sdk (streaming)
- **MCP**: @modelcontextprotocol/sdk
- **Storage**: electron-store
- **Schemas**: Zod 4
- **Markdown**: react-markdown + remark-gfm + remark-math + rehype-katex
- **Diagrams**: mermaid
- **Code Highlighting**: highlight.js
- **State Machines**: xstate (skill execution)

## Theme System

CSS variables defined in `src/renderer/themes/tokens.ts`:
- `lightTokens` / `darkTokens` define all colors
- `applyTheme()` sets CSS variables on `:root`
- Variables: `--background`, `--surface`, `--text-primary`, `--border`, etc.

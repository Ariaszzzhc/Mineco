# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Manong is a desktop AI coding assistant built with Electron Forge, Vite, React, and TypeScript. It uses the Anthropic API for AI capabilities.

## Commands

```bash
pnpm start          # Run the app in development mode
pnpm run lint       # Run ESLint on .ts/.tsx files
pnpm run package    # Package the app for distribution
pnpm run make       # Create distributable installers
```

## Architecture

### Electron Multi-Process

- **Main Process** (`src/main.ts`) - Node.js environment, handles window creation, IPC, agent loop, and tool execution
- **Preload Script** (`src/preload.ts`) - Bridge between main and renderer with contextBridge API exposing `window.manong`
- **Renderer Process** (`src/renderer/`) - React UI with Zustand state management and Tailwind CSS

### Core Modules

```
src/
├── shared/           # Types shared between processes
│   ├── types.ts      # Message, Part, Session, StreamEvent, AppConfig
│   ├── tool.ts       # ToolDefinition interface, defineTool()
│   └── ipc.ts        # IPC_CHANNELS constants
│
├── main/
│   ├── ipc/          # IPC handlers for renderer communication
│   └── services/
│       ├── agent/    # AgentLoop - streaming + tool execution
│       ├── provider/ # AnthropicProvider - API integration
│       └── tools/    # 6 tools: read, write, edit, list_dir, search, shell
│
├── preload.ts        # Exposes window.manong API
│
└── renderer/
    ├── App.tsx       # Root component with three-column layout
    ├── components/   # UI components (Sidebar, ChatPanel, TitleBar, etc.)
    └── stores/       # Zustand state management
```

### IPC API (window.manong)

```typescript
window.manong.agent.start(sessionId, message, providerConfig)
window.manong.agent.stop()
window.manong.agent.onStream(callback)

window.manong.session.create(workingDir?)
window.manong.session.list()
window.manong.session.get(sessionId)
window.manong.session.delete(sessionId)
window.manong.session.update(session)

window.manong.fs.openFolder()
window.manong.fs.readFile(path)
window.manong.fs.writeFile(path, content)
window.manong.fs.listDir(path)

window.manong.config.get()
window.manong.config.set(config)

window.manong.window.minimize/maximize/close()
```

## Build Configuration

Three separate Vite configs:
- `vite.main.config.ts` - Main process
- `vite.preload.config.ts` - Preload script
- `vite.renderer.config.ts` - Renderer with esbuild JSX transformation

## Tech Stack

- **UI**: React 19 + Zustand + Tailwind CSS 3
- **AI**: @anthropic-ai/sdk for streaming API
- **Storage**: electron-store for config persistence
- **Markdown**: react-markdown + remark-gfm

## Packaging

Configured in `forge.config.ts`. Supports:
- Windows (Squirrel)
- macOS (ZIP)
- Linux (deb, rpm)

<p align="center">
  <img src="build/icon.png" alt="Mineco" width="128" height="128">
</p>
<h1 align="center">Mineco</h1>
<p align="center">面向 Claude Agent SDK 的原生桌面工作台。</p>
<p align="center">
  <a href="README.md">English</a> ·
  <a href="#快速开始">快速开始</a>
</p>

---

> **注意：** 本项目正处于快速开发阶段，API 和内部结构可能随时变更。

## Mineco 是什么？

Mineco 是一个原生桌面应用，把 **Claude Agent SDK**（Claude Code 背后的同一引擎）装进一个统一的工作台。在一个窗口里管理 agent、工作区、MCP 服务、技能和按工作区隔离的记忆。选好工作区和 agent，host 会为每一轮自动组装上下文。

打开文件夹，选一个 agent，开始会话。

## 核心能力

- **基于 Claude Agent SDK** — 运行真正的原生 Claude Code 引擎，流式呈现在桌面 UI 里。
- **隔离的 agent** — 每个 agent 有独立的配置目录、凭据（token / Base URL）和模型别名。按轮切换 agent，绝不污染你的 `~/.claude`。
- **以工作区为中心** — 把工作区指向一个项目目录，会话、MCP、技能、记忆全部绑定其上。
- **MCP 服务** — 三级作用域（全局 / 项目 / 本地）自动合并并注入。
- **技能（Skills）** — 同样的三级作用域，基于目录管理。
- **按工作区记忆** — 持久化笔记，注入进 agent 的上下文。
- **持久会话** — 每个会话对应一个常驻引擎查询，完整转录存于 SQLite，重开自动恢复。
- **实时流式** — 文本、深度思考、工具调用实时流出；助手输出以 Markdown + 语法高亮渲染。
- **不打包重型二进制** — ~235 MB 的原生引擎不随安装包分发，首次运行时下载并校验。
- **默认安全** — 上下文隔离、沙箱化渲染进程，UI 层不接触 Node。

## 快速开始

### 环境要求

- Node.js >= 22
- pnpm 10.29

### 安装与运行

```bash
pnpm install
pnpm dev
```

在 **设置** 里创建 agent 并填入 Anthropic 凭据，打开一个文件夹，开始会话。首次运行会把引擎二进制下载到 `~/.mineco`。

### 打包

```bash
pnpm dist
```

通过 electron-builder 在 `release/` 下生成安装包。原生引擎二进制在首次启动时下载，不打进安装包 —— 打包细节见 [`CLAUDE.md`](CLAUDE.md)。

## 许可证

MIT

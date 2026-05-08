# 开发工作流和规范

版本：0.1 草案

状态：工作约定

相关文档：

- [AI Agent Runtime 设计](../architecture/agent-runtime-design.md)
- [Agent Runtime 协议](../protocol/agent-runtime-protocol.md)
- [Phase 0 本地 Agent 执行架构](../roadmap/phase-0-local-agent-execution.md)

语言：中文

## 1. 目标

这份文档定义 Mineco agent 的开发流程、工程规范和验收规则。它的作用是让后续实现始终围绕“每个阶段都可用”的产品路线推进，而不是只堆底层抽象。

核心原则：

- 每个阶段都必须交付一个能运行、能完成真实 coding 任务的 agent 能力；当前产品界面是第一 interface 和默认验收入口。Phase 0 使用 REPL-style terminal loop，后续演进到 TUI。
- 任何底层抽象都必须服务当前阶段的可用产品。
- Provider、tools、产品界面、skills、MCP 的边界必须清楚，不能互相越权。
- 所有高风险行为必须可审批、可审计、可恢复。
- 测试和 replay 是 runtime 的一等能力，不是后补。

## 2. 开发阶段节奏

开发按纵向产品切片推进：

```text
Phase 0: Local Agent Execution
Phase 1: Reliability and Reviewability
Phase 2: MCP and Tool Ecosystem
Phase 3: Agent Skills
Phase 4: Provider Abstraction
Phase 5: Long-Running Coding Agent
Phase 6: Automation and Extensibility
```

每个 phase 必须包含：

- 用户可见能力。
- Runtime 支撑能力。
- 工具/权限边界。
- 持久化和恢复策略。
- 测试策略。
- 手工验收脚本。
- 已知限制。

不能只交付“内部模块完成”，必须能通过当前 interface 验证；Phase 0 默认用 REPL 验收。

## 3. 工作流

### 3.1 设计先行

开始实现一个功能前，先确认它属于哪个 phase。

如果功能会改变这些边界，必须先更新设计文档：

- Agent loop。
- RuntimeEvent。
- ToolRuntime 权限模型。
- Provider adapter contract。
- Session store schema。
- Agent Skills/MCP 加载模型。
- 产品界面与 runtime 的接口。

小的内部实现不需要单独写设计，但不能违反现有文档。

### 3.2 任务拆分

每个开发任务应该按这个顺序拆：

1. 用户场景：用户在当前产品界面里要完成什么。
2. Runtime event：产品界面需要看到什么事件。
3. State change：session/items/events/artifacts 如何落盘。
4. Tool/provider 行为：是否涉及权限、审批、外部调用。
5. 测试：unit、integration、replay、manual。

不要从“我要新增一个类/模块”开始拆任务。

### 3.3 实现顺序

推荐实现顺序：

1. Protocol/interface 类型。
2. Store/event 持久化。
3. Runtime core 行为。
4. Tool/provider adapter。
5. REPL/TUI 渲染和交互。
6. Tests。
7. Manual acceptance。
8. 文档更新。

如果产品界面依赖的 runtime event 还不稳定，先做最小 event，再做 UI。

### 3.4 变更完成定义

一个功能完成必须满足：

- 用户能从当前产品界面入口触发。
- RuntimeEvent 能表达关键状态。
- Session store 能持久化关键数据。
- 错误路径有明确行为。
- 高风险动作有 approval 或明确禁止。
- 至少有相关单元/集成测试。
- 如果涉及 agent loop，必须有 replay 或 mock provider 测试。
- 文档与实现边界一致。

## 4. 架构边界规范

### 4.1 Product Surface

REPL、TUI 和未来 HTTP/API surface 只能做：

- 收集用户输入。
- 展示 session、events、tool outputs、approval、history。
- 调用 Runtime SDK。
- 维护本地 UI state，例如 pane、scroll、selection。

产品界面不能做：

- 直接调用 provider SDK。
- 直接执行 shell。
- 直接读写 workspace 文件。
- 直接读取 SQLite store、artifact 文件或 provider event log。
- 自己决定 tool approval。
- 修改 transcript。

所有动作必须经过 Runtime SDK。

### 4.2 Agent Core

Agent Core 负责：

- session lifecycle。
- run loop。
- context preparation。
- provider invocation。
- tool orchestration。
- status transitions。
- cancellation/resume。

Agent Core 不能：

- 依赖具体 provider SDK。
- 执行工具细节。
- 读写任意本地文件，除非通过 Store 或 ToolRuntime。
- 把 provider-specific shape 暴露给产品界面。

### 4.3 Provider Adapter

Provider Adapter 负责：

- 把 `RunStepInput` 映射到供应商请求。
- 把供应商响应流映射到 `RunEvent`。
- 报告 capabilities。
- 映射 provider state。
- 映射 provider errors。

Provider Adapter 不能：

- 执行 tools。
- 做 approval 决策。
- 读写 workspace。
- 泄漏 hidden reasoning。
- 把 provider error 包装成普通 assistant text。

### 4.4 ToolRuntime

ToolRuntime 是唯一工具执行边界。

执行顺序固定：

```text
lookup tool
  -> validate input schema
  -> canonicalize paths / normalize command
  -> evaluate policy and risk
  -> request approval if needed
  -> execute
  -> redact/truncate/artifact output
  -> return ToolResultItem
```

任何内置 tool、MCP tool、skill script、connector tool 都必须走同一个 ToolRuntime。

### 4.5 Store

Store 负责：

- session metadata。
- append-only items。
- provider events。
- runtime events。
- approvals。
- artifacts。

Store 规范：

- transcript source of truth 是结构化 `items`。Phase 0 使用 SQLite `items` 表；导出时可以转成 JSONL fixture。
- event logs append-only。
- `session.json` 可以覆盖，但不能成为唯一事实来源。
- 大输出进入 artifacts。
- provider state 可以丢失，不能成为恢复的唯一依赖。

## 5. TypeScript / Node.js 代码规范

### 5.1 基本规则

- 使用 TypeScript strict mode。
- 使用 Node.js-first runtime 和工具链。
- 最低 Node.js 版本为 25。
- 默认使用 pnpm workspace 管理 monorepo。
- 使用 Turborepo 编排 monorepo task graph；root `build`、`check`、`dev` 等脚本通过 `turbo run ...` 进入 package 脚本。
- 使用 Biome 作为默认 formatter、linter 和 import organizer；root `lint`、`lint:fix`、`format` 分别对应 `biome check .`、`biome check --fix .`、`biome format --fix .`。
- 自动测试使用 Vitest，默认 root 命令为 `pnpm test`，底层执行 `vitest run`。
- 类型检查使用 TypeScript compiler。
- 公共接口必须显式导出类型。
- Runtime 边界类型放在 `packages/protocol` 或等价协议包。
- 不在业务代码中使用 `any`，除非是 provider opaque state 或 JSON schema 输入。
- 对外暴露的 union type 必须有 discriminant 字段，例如 `type`。
- 错误必须使用结构化 `AgentError` 或 `ToolError`。
- Schema 使用 Zod。tool/provider 需要 JSON Schema 时，可以从 Zod schema 派生或维护显式 JSON Schema，但两者必须有测试覆盖。
- 持久化使用 Kysely + Node.js 内置 `node:sqlite`。`DatabaseSync` 只允许藏在内联 Kysely node:sqlite dialect 内；业务边界使用 Effect service，SDK 边界保持 Promise / AsyncIterable。
- Kysely 是 Store implementation 的唯一 query builder 和 migration API；业务代码不能直接使用 `node:sqlite` statement。
- Effect 是 runtime 内部结构化并发核心；AgentCore、ToolRuntime、provider streaming、approval waiting、sandbox process lifetime 必须能被 Effect scope interrupt。

### 5.2 命名

- 文件名使用 kebab-case：`tool-runtime.ts`。
- 类型和类使用 PascalCase：`ToolRuntime`。
- 函数和变量使用 camelCase：`runSession`。
- tool 名称使用 dot namespace：`file.read`、`shell.run`。
- RuntimeEvent 使用 dot event name：`tool.started`、`approval.requested`。
- RuntimeEvent 和 SDK-facing DTO 的源真相是 [Agent Runtime 协议](../protocol/agent-runtime-protocol.md)。Phase 文档只能声明本阶段必需子集或扩展，不能使用 snake_case event name。
- Approval request 必须有稳定 `id`。UI/REPL 调用 `decideApproval` 时传 `ApprovalRequest.id`，不能传 `callId`。
- Plan approval 必须通过 `plan.submit` tool call 复用 `ApprovalRequest` 与 `decideApproval`，不得新增没有 `callId` 的 approval 变体。

### 5.3 模块依赖方向

允许：

```text
repl/tui -> runtime sdk -> agent core -> provider/tool/store interfaces
agent core -> protocol
tool runtime -> protocol + store + tool implementations
provider adapter -> protocol + provider SDK
```

禁止：

```text
provider adapter -> tool runtime
provider adapter -> repl/tui
tool implementation -> repl/tui
protocol -> runtime implementation
store -> repl/tui
```

### 5.4 错误处理

错误必须分类：

- `provider`
- `tool`
- `validation`
- `permission`
- `rate_limit`
- `timeout`
- `context`
- `internal`

规则：

- Tool validation error 通常 model-visible。
- Permission denied 通常 model-visible。
- Provider auth error runtime-only。
- Internal invariant failure runtime-only。
- shell exit code 非 0 不是 ToolRuntime error，应作为 terminal result 返回。

## 6. Protocol 规范

### 6.1 版本

Protocol schema 必须有版本策略：

- breaking schema change 要更新 protocol version。
- session store schema change 要提供 migration 计划。
- unknown optional fields 必须可忽略。
- unknown event types 要可记录并跳过。

### 6.2 Transcript

Transcript 只能写结构化 item：

- `user_message`
- `assistant_message`
- `tool_call`
- `tool_result`
- `system_observation`
- `summary`
- `checkpoint`

不要把工具输出拼成 assistant text 存进去。

### 6.3 Streaming

规则：

- `text_delta` 只用于实时展示。
- `message_done.message` 才是最终 assistant item。
- `tool_call_delta` 只用于构建工具参数。
- `tool_call_done.call` 才能进入 transcript。

### 6.4 Content

大内容不要直接进入 transcript：

- 长 terminal output 写 artifact。
- 大文件写 artifact 或 file ref。
- 图片、PDF、二进制使用 reference。
- model-visible content 应是摘要、尾部错误或必要片段。

### 6.5 Library Boundary

Protocol package 不能依赖：

- Effect。
- Kysely。
- `node:sqlite`。
- provider SDK。
- REPL/TUI package。

Protocol 只保留结构化类型、schema 边界和 provider-neutral contract。Effect error、Kysely row、SQLite statement、provider private response shape 都不能进入 protocol type。

## 7. Tool 开发规范

每个 tool 必须定义：

- stable name。
- description。
- input JSON schema。
- output 约定。
- risk level。
- permissions。
- timeout。
- max output policy。
- tests。

Tool implementation 必须：

- 校验输入。
- canonicalize path。
- 遵守 workspace boundary。
- 支持 cancellation 或 timeout。
- 返回结构化 `ToolResultItem`。
- 不泄漏 secrets。

Tool 不应该：

- 自己请求模型。
- 自己写 transcript。
- 自己做 UI。
- 读取未授权路径。

## 8. Provider Adapter 开发规范

每个 provider adapter 必须包含：

```text
adapter.ts
capabilities.ts
input-mapper.ts
event-mapper.ts
tool-mapper.ts
errors.ts
tests/
```

Adapter tests 必须覆盖：

- final message。
- streaming text。
- single tool call。
- tool result continuation。
- provider error。
- unsupported content。
- capabilities accuracy。

真实 provider tests 和 fixture tests 要分开。CI 默认跑 fixture/mock tests，真实 provider tests 需要显式启用。

Provider adapter 内部可以返回 Effect，但 provider-neutral `AgentProtocolProvider` contract 不能包含 provider SDK 私有类型。Provider stream 被 run scope interrupt 时必须 abort 底层 HTTP request。

Phase 0 provider 最低要求是 Level 2 Tool Calling：native tool calling 或可靠 JSON fallback 二选一。Streaming 是可选能力；不支持 streaming 的 endpoint 可以合成最终 assistant message，但 capabilities 必须声明 `streaming=false`。如果 endpoint 既不支持 native tool calling，也无法可靠 JSON fallback，配置阶段必须 fail fast。

## 8.1 Store / Kysely 开发规范

Store implementation 使用 Kysely。

规则：

- 所有 schema migration 放在 `packages/runtime/src/store/migrations/`。
- 所有 runtime query 通过 Kysely query builder 或 Kysely raw SQL。
- Kysely raw SQL 只能用于 migration、pragma、maintenance 或经过测试证明必要的查询。
- `node:sqlite` 只允许出现在 `packages/runtime/src/store/kysely-node-sqlite/`。
- 内联 Kysely node:sqlite dialect 必须保留来源、license 和本项目修改说明。
- Store 对 AgentCore 暴露 Effect service，不暴露 Kysely instance。
- Store 返回 protocol/runtime domain type，不返回 Kysely row type。
- 同一 session 的 active run 必须由数据库约束保护。Phase 0 使用 `runs(session_id)` partial unique index，覆盖 `running`、`waiting_for_approval`、`waiting_for_tool`、`cancelling`。
- `sessions.status` 不得包含 run 中间态。`waiting_for_tool`、`waiting_for_approval`、`cancelling` 只能出现在 `runs.status`，TUI 展示时从 active run 或 `run.status_changed` 派生。
- append item/event 必须在 transaction 内分配 per session、per table 的 `seq`，不能在内存中猜测序号。

Migration tests 必须覆盖：

- fresh database migrate to latest。
- migrate twice is no-op。
- create session -> append item -> read session。
- SQLite constraint violation 映射为 `StoreError`。

## 8.2 Logging 开发规范

日志实现使用 LogTape，依赖 `@logtape/logtape`。参考官方 Quick start：[LogTape Quick start](https://logtape.org/manual/start)。Effect runtime 内的日志必须通过 Effect custom logger 转发到 LogTape，参考 [Effect Custom loggers](https://effect.website/docs/observability/logging/#custom-loggers)。

规则：

- application entry point 负责调用 `configure()`；runtime、provider adapter、tool implementation、Store 和 library 模块不得自行 configure logging。
- 模块通过 `getLogger(["mineco", ...])` 获取 logger，category 必须稳定。
- 日志使用结构化字段，优先记录 id/ref/hash/summary，不记录完整大内容。
- 不在日志中写入 API key、secret 明文、完整 env、auth header、完整用户文件、完整 terminal output 或 provider raw sensitive payload。
- 日志必须经过与 artifacts/logs 一致的 redaction helper。
- LogTape 日志是诊断信号，不是 RuntimeEvent、provider_events、approval audit、transcript item 或 artifact store 的替代品。
- REPL/TUI 不以 LogTape 为渲染源；产品界面继续使用 RuntimeEvent 和 SDK history reader。
- 测试可以使用 test sink 或禁用 sink，但不能依赖 console 文本作为断言源。
- Effect fiber 内使用 `Effect.log*`、`Effect.annotateLogs` 和 `Effect.withLogSpan`；入口层通过 `Logger.replace(Logger.defaultLogger, makeEffectLogTapeLogger(...))` 提供 LogTape bridge。
- Effect log annotation 映射为 LogTape structured properties，必须复用统一 redaction helper；不得在 Effect logger bridge 中输出 secret、完整文件内容、provider raw payload 或未截断 terminal output。
- 不允许在 production runtime 里直接提供 Effect 内置 `Logger.pretty`、`Logger.json` 或裸 `Logger.defaultLogger`，避免绕过 LogTape sink、level 和 redaction 配置。

## 8.3 Effect 开发规范

Runtime implementation 使用 Effect 管理副作用和并发。

规则：

- Agent run loop 必须在一个 scoped Effect 内执行。
- tool call、provider stream、approval wait、shell process 必须挂在 run scope。
- cancel/interruption 必须释放 provider request、shell process、locks 和 pending approvals。
- 不允许无归属 background promise。
- `setTimeout`、event listener、AbortController 必须被 Effect scope 或 finalizer 管理。
- Effect typed errors 在 RuntimeEvent / transcript 边界映射为 `AgentError` / `ToolError` / `TerminalReason`。
- Public SDK 不暴露 Effect 类型。
- Effect runtime 日志统一走项目的 LogTape bridge layer；业务逻辑里不要直接把 console logger、pretty logger 或 JSON logger 提供给 production program。

Testing:

- Vitest 测 Effect 程序时使用 `Effect.runPromise`。
- 需要替换依赖时使用 test Layer。
- cancellation、timeout、retry policy 必须有 focused tests。

## 9. Product Surface 开发规范

REPL/TUI 以 RuntimeEvent 为渲染源。

Phase 0 最小 REPL：

- 启动时显示 workspace、model、sandbox status。
- main event stream printing。
- prompt input。
- approval prompt。
- session history command。

REPL 渲染规则：

- assistant delta / message 直接流式打印。
- tool output 默认打印摘要。
- 长输出显示 artifact reference。
- approval 必须显示 tool name、risk、input preview。
- 错误必须显示 category 和可操作信息。
- 不在输出中暴露 secret values。

TUI 后续渲染规则：

- tool output 默认折叠摘要。
- 长输出显示 artifact reference。
- approval 必须显示 tool name、risk、input preview。
- 错误必须显示 category 和可操作信息。
- 不在 UI 中暴露 secret values。

产品界面不应阻塞 runtime event consumption。长输出和 repaint 要节流。

## 10. Agent Skills 规范

必须兼容 Agent Skills 标准。

Skill 最小结构：

```text
skill-name/
  SKILL.md
  agents/openai.yaml
  scripts/
  references/
  assets/
```

`SKILL.md` frontmatter 只依赖：

```yaml
---
name: skill-name
description: Clear trigger description.
---
```

规则：

- `SKILL.md` 是唯一必需入口。
- `skill.json` 只能作为可选扩展 metadata。
- skill body 触发后才加载。
- references/assets/scripts 按需加载。
- skill 不能提升权限。
- skill script 也必须走 ToolRuntime 或明确受控执行器。

## 11. MCP 规范

MCP 在 Phase 2 引入，但边界现在就确定：

- MCP server 是 tool/resource/prompt 来源，不是权限来源。
- MCP tool 必须映射成 RuntimeToolSpec。
- MCP tool 执行必须走 ToolRuntime。
- Workspace MCP 默认低信任。
- MCP resource 进入模型前必须通过 context filter。
- MCP prompt 不能覆盖 runtime policy。

## 12. 安全规范

沙箱参考 Codex sandboxing 的选型和职责划分，不参考其配置模型。Sandbox 是技术边界，approval 是越界或高风险动作的用户决策流程。工具执行和 spawned commands 都必须受同一边界约束。

### 12.1 文件系统

- 默认只允许 workspace 内读写。
- 所有路径先 canonicalize。
- symlink 必须解析后再检查边界。
- denied paths 优先级最高。
- 覆盖文件需要记录旧 hash。

### 12.2 Sandbox

平台选型：

- macOS：Seatbelt-style native sandbox。
- Linux：bubblewrap-style sandbox。
- WSL2：Linux sandbox path。
- Windows：native Windows sandbox path。

开发规则：

- ToolRuntime 是唯一进入 sandbox runner 的路径。
- `shell.run`、package manager、test runner、build command 都必须继承 sandbox boundary。
- 如果平台强制沙箱不可用，必须显式进入 degraded sandbox 状态。
- degraded sandbox 状态不提供 OS 级文件/网络隔离承诺；它只保证 cwd 固定到 workspace、runtime path policy、timeout、output limit、env redaction 和全量 shell approval。
- Phase 0 degraded sandbox 下所有 `shell.run` 都必须 approval；install/download/curl/wget/git clone 等明确网络命令默认拒绝，不能只靠 approval 放行。
- enforced sandbox 下，网络类 shell 命令可以按 policy 请求 approval；approval 通过后仍受 sandbox network policy 限制。
- sandbox 初始化失败不能静默变成 full access。

### 12.3 Shell

高风险命令必须 approval：

- 删除、递归删除。
- 移动大量文件。
- `git push`。
- deploy/release。
- install/download。
- 访问生产数据库。
- 读取 credentials。

Phase 0 可以用保守 pattern matching，后续引入更细的 parser。

### 12.4 Secrets

- secrets 不进入 transcript。
- secrets 不进入 RuntimeEvent。
- model 只能看到 capability fact，不能看到 secret value。
- logs/artifacts 要做 redaction。

## 13. 测试规范

### 13.1 测试分层

必须有：

- Unit tests：纯函数、schema、policy、mapper。
- Integration tests：runtime + mock provider + tools。
- Replay tests：固定事件，不调用真实 provider。
- Manual acceptance：从当前产品界面执行真实任务；Phase 0 从 REPL 执行。

### 13.2 Phase 0 最低测试

- SDK create session -> final。
- MockProvider emits file.read -> tool result -> final。
- `shell.run` exit 1 返回 terminal result。
- `file.write` overwrite 已有文件触发 approval。
- `file.write` append 已有文件触发 approval。
- approval denied 写入 denied tool result。
- session 落盘后可打开历史。

### 13.3 Replay

Replay fixture 必须可读：

```text
tests/fixtures/
  tool-call-file-read/
    provider-events.jsonl
    expected-items.jsonl
```

Replay 不能调用真实 provider，不能依赖网络。

## 14. 文档规范

文档分层：

- `agent-runtime-protocol.md`：provider-neutral 协议。
- `agent-runtime-design.md`：长期总设计。
- `phase-*.md`：阶段架构和验收。
- `development-workflow-and-standards.md`：开发流程和规范。

文档变更规则：

- 改架构边界，先改设计文档。
- 改 phase 范围，改对应 phase 文档。
- 改协议类型，改 ARP 文档。
- 改开发流程，改本文件。

不要把阶段验收标准散落在 issue 或聊天记录里。

## 15. Review 规范

代码 review 优先看：

- 是否能从当前产品界面跑通用户场景。
- 是否绕过 ToolRuntime。
- 是否把 provider shape 泄漏进 AgentCore/产品界面。
- 是否把大输出塞进 transcript。
- 是否缺少 approval。
- 是否缺少 replay/integration test。
- 是否破坏 session 恢复。
- 是否违反 workspace boundary。

Review 输出应该先列风险和 bug，再列改动总结。

## 16. Release / Phase Gate

每个 phase 结束前必须完成 gate checklist：

- 当前产品界面可启动。
- 手工验收任务通过。
- 自动测试通过。
- `pnpm check` 和 `pnpm lint` 通过。
- session store 可查看历史。
- 崩溃/取消路径有明确行为。
- 文档更新。
- 已知限制记录清楚。

Phase 0 gate：

- `mineco` 能在当前 workspace 启动。
- 用户能输入 coding 任务。
- agent 能读文件、搜索文件、运行 shell。
- agent 能写 workspace 文件。
- 危险操作有 approval。
- session 落到 SQLite。
- `pnpm test` 或 `vitest run` 通过。
- MockProvider 测试通过。
- OpenAI-compatible provider 可配置并运行。

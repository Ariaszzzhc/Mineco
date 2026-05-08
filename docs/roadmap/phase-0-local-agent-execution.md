# Phase 0 本地 Agent 执行架构

版本：0.1 草案

状态：架构提案

相关文档：

- [AI Agent Runtime 设计](../architecture/agent-runtime-design.md)
- [Agent Runtime 协议](../protocol/agent-runtime-protocol.md)

语言：中文

## 1. 阶段目标

Phase 0 的目标是交付一个最小但真实可用的本地 coding agent 执行闭环。当前确认的 Phase 0 interface 是 REPL-style 终端入口；TUI 延后到后续阶段增强。用户应该能在终端里打开它，输入一个 coding 任务，让 agent 读项目、运行命令、修改文件或给出明确结论。

Phase 0 完成后，用户能做：

- 在 REPL 输入 coding 任务。
- 看到 agent 的消息、工具调用、shell 输出和最终结果。
- 让 agent 读取 workspace 文件。
- 让 agent 写入 workspace 文件。
- 让 agent 运行测试或构建命令。
- 对危险 shell/write 操作进行 approve/deny。
- 退出后再次打开，查看历史 session。

## 2. 产品原则

- 每个阶段都必须可用。Phase 0 就要有能通过 REPL 使用的本地 agent 执行闭环。
- REPL 不能绕过 runtime 直接执行工具。
- Runtime kernel 只做 Phase 0 需要的最小闭环，不追求一次性完美。
- Provider 至少要有一个真实可用后端；MockProvider 只能用于测试。
- 文件和 shell 权限默认收紧到当前 workspace。
- 沙箱参考 Codex sandboxing 的选型：sandbox 负责技术边界，approval 负责越界决策；spawned commands 也必须继承边界。
- 事件流从第一天就是产品接口，REPL、测试、后续 TUI 和 API 都消费同一套 RuntimeEvent。
- 技术栈采用 Node.js-first：TypeScript、Turborepo、Biome、Vitest、Zod、Kysely、Effect、`node:sqlite`。

## 3. 非目标

Phase 0 不做：

- 完整 Agent Skills 自动发现。
- MCP。
- 多 provider fallback。
- 长期记忆。
- 向量检索。
- 自动化调度。
- 插件系统。
- 完整 diff/test 专用面板。
- 远程 worker。

## 4. 架构总览

```text
Local Coding REPL
  prompt input, event stream printing, tool call display,
  approval prompt, simple session history commands

Runtime SDK
  createSession, runSession, sendMessage, decideApproval, cancelSession

Agent Core
  Session lifecycle, run loop, context preparation, provider invocation,
  tool orchestration, status transitions

Provider Adapter
  One real provider adapter plus MockProvider for tests

Tool Runtime
  Tool registry, schema validation, workspace policy, sandbox runner,
  approval gate, execution, output shaping

Built-in Tools
  file.list, file.search, file.read, file.write, shell.run

State Store
  .mineco/runtime.db SQLite metadata and append-only logical logs,
  filesystem artifacts
```

关键边界：

- REPL 只渲染 RuntimeEvent，不理解 provider 私有响应。
- Agent Core 只调用 `AgentProtocolProvider`，不依赖具体 SDK。
- Provider Adapter 不执行 tools。
- Tool Runtime 是唯一读写文件、运行 shell 和进入 sandbox runner 的路径。
- Store 的 `items` 表是 transcript source of truth。
- Phase 0 实现不能为了简化 REPL 直接调用 provider、直接执行工具或绕过 Store 写内存状态；这些边界是进入 Phase 1 的前提。
- LogTape 只用于诊断日志；不能替代 RuntimeEvent、provider_events、approvals、items 或 artifacts。

## 5. 技术基线

Phase 0 技术选型：

- Runtime：Node.js + TypeScript。
- Package manager：pnpm workspace。
- Monorepo task runner：Turborepo，root `build`、`check`、`dev` 通过 `turbo run ...` 编排 package 脚本。
- Code quality：Biome，root `lint` / `lint:fix` / `format` 分别执行 `biome check .`、`biome check --fix .`、`biome format --fix .`。
- Toolchain：`pnpm check`、`pnpm lint`、`pnpm test`，底层分别覆盖 TypeScript check、Biome check 和 Vitest。
- Schema：Zod，必要时从 Zod schema 导出或生成 JSON Schema。
- Logging：LogTape，依赖 `@logtape/logtape`。
- Store：Kysely + Node.js 内置 `node:sqlite`。`node:sqlite` dialect 参考 `wolfie/kysely-node-native-sqlite` 并内联到项目，不作为外部运行时依赖。外部 Store interface 使用 Effect，SDK 再转 Promise。
- Structured concurrency：Effect 作为 AgentCore、ToolRuntime、Provider stream、approval wait、sandbox process lifetime 的内部执行模型。
- Provider：OpenAI-compatible Chat Completions API。
- UI：REPL-style terminal loop，暂不引入 TUI 框架。
- Shell：统一通过 `node:child_process` 封装和 `SandboxRunner`，使用 `AbortController`、timeout 和输出上限治理子进程。
- 最低 Node.js 版本：Node.js 25+。测试由 Vitest 管理；Node 25 的内置能力主要用于 `node:sqlite`、现代 ESM/TypeScript 执行路径和标准库能力。

## 6. Phase 0 用户体验

### 6.1 启动

```text
mineco
```

默认打开当前目录作为 workspace。

启动后进入 REPL：

```text
Mineco
Workspace: E:\Projects\foo
Model: openai-compatible/model
Sandbox: degraded

mineco> 找出测试失败原因并修复
assistant: ...
tool.started file.search {...}
tool.finished file.search ok
approval shell.run risk=medium command="pnpm test" [y/n] y
tool.finished shell.run exit=1
assistant: ...
```

### 6.2 最小交互

- `Enter`：发送任务。
- `Ctrl+C`：取消当前 run 或退出。
- approval 出现时，用户输入 `y` / `n`。
- `:sessions`：查看历史 session。
- `:open <sessionId>`：打开历史 session。
- `:quit`：退出。

Phase 0 不要求复杂 pane、鼠标、diff 高亮和 command palette。

## 7. 推荐包结构

```text
package.json
pnpm-workspace.yaml
turbo.json
biome.json
tsconfig.base.json
vitest.config.ts
packages/
  protocol/
    package.json
    tsconfig.json
    src/
      content.ts
      items.ts
      events.ts
      provider.ts
      tools.ts
      policy.ts
      errors.ts
      index.ts
  runtime/
    package.json
    tsconfig.json
    src/
      core/
        agent-core.ts
        run-loop.ts
        session-state.ts
      context/
        context-manager.ts
        instruction-assembler.ts
      tools/
        tool-runtime.ts
        tool-registry.ts
        approval-controller.ts
        builtins/
          file-list.ts
          file-search.ts
          file-read.ts
          file-write.ts
          shell-run.ts
      store/
        kysely-store.ts
        schema.ts
        migrations.ts
        artifacts.ts
        kysely-node-sqlite/
          dialect.ts
          driver.ts
          connection.ts
      providers/
        mock-provider.ts
      services/
        layers.ts
        runtime-store-service.ts
        tool-runtime-service.ts
        sandbox-runner-service.ts
      sdk/
        runtime.ts
      events/
        runtime-events.ts
      index.ts
  providers/
    openai-compatible/
      package.json
      tsconfig.json
      src/
        adapter.ts
        event-mapper.ts
        input-mapper.ts
        tool-mapper.ts
        client.ts
  repl/
    package.json
    tsconfig.json
    src/
      main.ts
      repl-loop.ts
      event-printer.ts
      approval-prompt.ts
```

真实 provider 先选 OpenAI-compatible Chat Completions API。Phase 0 只要求一个真实 provider endpoint 能完成 agent loop；MockProvider 用于测试。

## 8. 核心接口

### 8.1 Runtime SDK

```ts
interface AgentRuntime {
  createSession(input: CreateSessionInput): Promise<RuntimeSession>;
  runSession(sessionId: string): AsyncIterable<RuntimeEvent>;
  sendMessage(sessionId: string, message: string): Promise<void>;
  decideApproval(approvalId: string, decision: ApprovalDecision): Promise<void>;
  cancelSession(sessionId: string, reason?: string): Promise<void>;
  listSessions(): Promise<RuntimeSessionSummary[]>;
  getSession(sessionId: string): Promise<RuntimeSession>;
  getActiveRun(sessionId: string): Promise<AgentRun | null>;
  listRuntimeEvents(sessionId: string, query?: EventLogQuery): Promise<EventPage<RuntimeEventRecord>>;
  listProviderEvents(sessionId: string, query?: EventLogQuery): Promise<EventPage<ProviderEventRecord>>;
  listApprovals(sessionId: string, query?: ApprovalQuery): Promise<EventPage<ApprovalRecord>>;
  listArtifacts(sessionId: string, query?: ArtifactQuery): Promise<EventPage<ArtifactRef>>;
  readArtifact(id: string): Promise<ArtifactBlob>;
}
```

REPL 只依赖这个接口。`:sessions`、`:open <sessionId>`、active run display、history replay、approval history 和 artifact display 都必须通过这些 SDK 读取接口完成，不能直接访问 SQLite store。Phase 0 UI 可以只渲染简化摘要，但 SDK surface 必须先闭合。

Runtime 内部可以使用 Effect，但 SDK 对外保持 Promise / AsyncIterable，不把 Effect 类型暴露给 REPL 或未来 API。

`ApprovalRecord` 是 approval history 的 SDK DTO，最小字段：

```ts
interface ApprovalRecord {
  id: string;
  sessionId: string;
  runId?: string;
  callId: string;
  status: "pending" | "approved" | "denied" | "expired";
  request: ApprovalRequest;
  decision?: ApprovalDecision;
  decisionSource?: "user" | "policy" | "runtime";
  decisionScope?: "once" | "prefix" | "session" | "workspace";
  matchedRule?: ApprovalRuleSnapshot;
  sandboxSnapshot?: SandboxSnapshot;
  createdAt: string;
  decidedAt?: string;
  expiresAt?: string;
}

interface ApprovalRuleSnapshot {
  id?: string;
  prefix?: string[];
  riskLevel?: string;
  source?: "user" | "policy" | "runtime";
}

interface SandboxSnapshot {
  mode: "enforced" | "degraded" | "disabled";
  cwd: string;
  network?: "disabled" | "enabled" | "allowlist";
  writableRoots?: string[];
}
```

### 8.2 RuntimeEvent

Phase 0 最小事件：

```ts
type TerminalReason =
  | "completed"
  | "max_turns"
  | "user_aborted"
  | "tool_denied"
  | "tool_error"
  | "model_error"
  | "context_blocked"
  | "permission_blocked"
  | "internal_error";

type RunStatus =
  | "created"
  | "running"
  | "waiting_for_tool"
  | "waiting_for_approval"
  | "cancelling"
  | "completed"
  | "failed"
  | "cancelled";

type RuntimeSessionStatus =
  | "created"
  | "running"
  | "waiting_for_user"
  | "completed"
  | "failed"
  | "cancelled";

type ActiveRunStatus =
  | "running"
  | "waiting_for_tool"
  | "waiting_for_approval"
  | "cancelling";

type RuntimeEvent =
  | { type: "session.created"; session: RuntimeSession }
  | { type: "run.started"; runId: string; sessionId: string }
  | { type: "run.status_changed"; runId: string; sessionId: string; status: ActiveRunStatus }
  | { type: "assistant.delta"; text: string }
  | { type: "assistant.message"; message: AssistantMessage }
  | { type: "tool.started"; call: ToolCallItem }
  | { type: "tool.finished"; result: ToolResultItem }
  | { type: "approval.requested"; request: ApprovalRequest }
  | { type: "approval.decided"; approvalId: string; decision: ApprovalDecision }
  | { type: "artifact.created"; artifact: ArtifactRef }
  | { type: "run.completed"; runId: string; sessionId: string; reason: "completed" }
  | { type: "run.failed"; runId: string; sessionId: string; reason: TerminalReason; error: AgentError }
  | { type: "run.cancelled"; runId: string; sessionId: string; reason: TerminalReason }
  | { type: "session.status_changed"; sessionId: string; status: RuntimeSessionStatus };
```

Provider 原始 `RunEvent` 仍要落盘，但 REPL 先消费 runtime 归一化事件。

Phase 0 最小终止原因必须能区分正常完成、用户取消、工具拒绝、工具错误、模型错误、上下文阻断和内部错误。REPL 可以只用简单文案展示，但 Store 必须保存结构化 `TerminalReason`。

`RunStatus` 和 `RuntimeSessionStatus` 以 [Agent Runtime 协议](../protocol/agent-runtime-protocol.md#20-session-model) 为唯一源真相。`terminated` 不是 status，runtime 层也不定义 `run.terminated`。Runtime terminal event 必须三选一且只发一次：`run.completed`、`run.failed`、`run.cancelled`。Provider stream 中的 `run_terminated` 只写入 `provider_events`，由 adapter 映射为 runtime terminal event。

Session status 不承载 run 的中间态。`waiting_for_tool`、`waiting_for_approval`、`cancelling` 只能写入 `runs.status`，不能写入 `sessions.status`，也不能触发 `session.status_changed`。REPL/TUI 显示这些状态时，必须从 active run 或 `run.status_changed` 派生。Phase 0 中 `sessions.status` 只允许 `created`、`running`、`waiting_for_user`、`completed`、`failed`、`cancelled`。

Approval ID 契约：

- `ApprovalRequest.id` 是 runtime 分配的稳定 ID。
- `decideApproval(approvalId, decision)` 的 `approvalId` 必须传 `ApprovalRequest.id`。
- `ApprovalRequest.callId` 只用于关联 tool call，不作为 approval decision 的主键。
- `approval.decided.approvalId` 必须等于对应 `ApprovalRequest.id`。

### 8.3 AgentProtocolProvider

继续采用 ARP：

```ts
interface AgentProtocolProvider {
  id: string;
  capabilities(): Promise<ProviderCapabilities>;
  runStep(input: RunStepInput): AsyncIterable<RunEvent>;
  countTokens?(input: TokenCountInput): Promise<TokenCountResult>;
}
```

Phase 0 adapter 只需要支持：

- text input/output。
- streaming 可选；如果 endpoint 不支持 streaming，adapter 必须合成 `assistant.message`，不发 `assistant.delta`。
- native tool calling 或可靠 JSON fallback tool calling，至少满足 Level 2 Tool Calling。
- tool call -> tool result -> continue。

Phase 0 provider 最低 compatibility level：

- Level 0 Text：必须。
- Level 1 Structured Output：如果没有 native tool calling，则必须用于 JSON fallback。
- Level 2 Tool Calling：必须，通过 native tool calling 或 JSON fallback 实现。
- Level 3 Streaming Agent Events：可选，不作为 Phase 0 阻断条件。

配置阶段必须 fail fast：如果 endpoint 既不支持 native tool calling，也不能可靠输出 JSON fallback，Phase 0 不应启动 agent run，而应提示用户更换 model/endpoint。

## 9. Agent Loop

```text
User sends task in REPL
  -> Runtime creates or appends to session
  -> AgentCore prepares context
  -> ProviderAdapter.runStep
  -> Runtime maps provider events to RuntimeEvents
  -> If tool call:
       ToolRuntime validates input
       ToolRuntime checks workspace policy
       ToolRuntime prepares sandbox policy
       ToolRuntime requests approval if needed
       ToolRuntime executes tool
       Runtime appends ToolResultItem
       AgentCore continues loop
  -> If final assistant message:
       Runtime marks session completed
       REPL shows final result
  -> If loop cannot continue:
        Runtime records TerminalReason
        Runtime emits exactly one of run.completed, run.failed, run.cancelled
        Store persists final run status
```

## 10. Context 第一版

Phase 0 context 不做 skills 和 memory，只拼：

1. Runtime safety instruction。
2. Built-in coding agent instruction。
3. Workspace facts：cwd、platform、writable roots。
4. Available tool specs。
5. Recent transcript items。
6. Latest user message。

Token 控制先用估算：

```text
estimatedTokens = ceil(chars / 4)
```

如果超预算：

- 优先保留最新 user message。
- 保留未完成 tool call/result。
- terminal 大输出只保留摘要和 artifact ref。
- 仍超预算则返回 model-visible context error。

## 11. Built-in Tools

### 11.1 file.list

用于列出目录。

规则：

- 只能访问 workspace 内路径。
- 默认不递归或限制递归深度。
- 忽略常见大目录： `.git`、`node_modules`、`dist`、`build`。

### 11.2 file.search

用于搜索文件名或文本。

规则：

- 优先使用本地搜索实现，后续可接 ripgrep。
- 限制最大结果数。
- 输出包含 path、line、preview。

### 11.3 file.read

规则：

- canonicalize path。
- 只能读 workspace。
- 限制最大读取大小。
- 大文件生成 artifact，模型只看摘要。

### 11.4 file.write

规则：

- 只能写 workspace。
- create 新文件为 low/medium risk，按 policy 可不审批。
- overwrite 已有文件需要 approval。
- append 已有文件需要 approval；append 新文件按 create 处理。
- 写入前记录旧 hash。
- 写入后返回新 hash 和简短摘要。

Phase 1 应引入 `file.patch` 或 `git.apply_patch`，减少整文件覆盖风险。

### 11.5 shell.run

规则：

- cwd 必须在 workspace。
- shell command 必须通过 sandbox runner 执行；Phase 0 如果平台强制沙箱未实现，必须显示 degraded sandbox 状态。
- enforced sandbox 下，spawned commands 继承同一组 workspace、network、timeout 和 output 限制。
- degraded sandbox 下，不声明具备 OS 级文件/网络隔离；真实保证只有 cwd 固定到 workspace、runtime path policy、timeout、output limit、env redaction 和全量 shell approval。
- enforced sandbox 下，destructive 命令和网络类命令可以按 policy 触发 approval；approval 通过后仍受 sandbox filesystem/network 限制。
- degraded sandbox 下，所有 `shell.run` 都必须 approval；install/download/curl/wget/git clone 等明确网络命令默认拒绝，不能只靠 approval 放行。
- 默认超时。
- destructive 命令需要 approval。
- stdout/stderr 超阈值写 artifact。
- exit code 非 0 返回 `status="ok"`，由模型根据 terminal result 处理失败。

## 12. Approval

Phase 0 approval 简单但必须真实工作。

需要 approval 的情况：

- enforced sandbox 下，`shell.run` 中包含删除、移动、push、deploy、install、网络下载等高风险模式。
- degraded sandbox 下，所有 `shell.run` 都需要 approval；install/download/curl/wget/git clone 等明确网络命令直接拒绝。
- `file.write` overwrite 已有文件。
- `file.write` append 已有文件。

不允许 approval 临时扩大 workspace root。Phase 0 中工具请求 workspace 外路径时，ToolRuntime 必须直接拒绝，写入 `ToolResultItem(status="denied")`，并以 `TerminalReason="permission_blocked"` 或 model-visible permission result 继续，不弹 approval。

Approval flow：

```text
ToolRuntime creates ApprovalRequest
  -> REPL renders prompt
  -> user y/n
  -> REPL calls decideApproval(request.id, decision)
  -> Runtime records decision using ApprovalRequest.id
  -> approved: execute tool
  -> denied: append ToolResultItem(status="denied")
```

## 13. Store

```text
.mineco/
  runtime.db
  artifacts/
    {artifactId}
```

SQLite 表结构基线：

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('created', 'running', 'waiting_for_user', 'completed', 'failed', 'cancelled')),
  terminal_reason TEXT,
  workspace_path TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('created', 'running', 'waiting_for_tool', 'waiting_for_approval', 'cancelling', 'completed', 'failed', 'cancelled')),
  terminal_reason TEXT,
  error_json TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
) STRICT;

CREATE UNIQUE INDEX one_active_run_per_session
ON runs(session_id)
WHERE status IN ('running', 'waiting_for_approval', 'waiting_for_tool', 'cancelling');

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(session_id, seq),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
) STRICT;

CREATE TABLE runtime_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  run_id TEXT,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(session_id, seq)
) STRICT;

CREATE TABLE provider_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  run_id TEXT,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(session_id, seq)
) STRICT;

CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  run_id TEXT,
  call_id TEXT NOT NULL,
  status TEXT NOT NULL,
  request_json TEXT NOT NULL,
  decision_json TEXT,
  decision_source TEXT,
  decision_scope TEXT,
  matched_rule_json TEXT,
  sandbox_snapshot_json TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
) STRICT;

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  sha256 TEXT,
  summary_json TEXT,
  created_at TEXT NOT NULL
) STRICT;
```

Store 规则：

- `items` 表是 transcript source of truth。
- `items`、`runtime_events` 和 `provider_events` 逻辑上 append-only，通过各自表内的 `(session_id, seq)` 保持顺序；`seq` 是 per session、per table 单调递增，不跨表共享。
- 大输出写入 `.mineco/artifacts/`，SQLite 只保存 metadata 和摘要。
- Kysely 是 Store implementation 的唯一 query/migration API。
- `DatabaseSync` 只藏在内联 Kysely node:sqlite dialect 内。
- Store service 对 runtime 内部返回 `Effect.Effect<..., StoreError>`，SDK 层再转换成 Promise。
- 同一 session 同时只能有一个 active run。active 状态包括 `running`、`waiting_for_approval`、`waiting_for_tool`、`cancelling`，由 partial unique index 强制。
- 创建 run、追加 item/event、更新 run status、更新 session status 必须在 `BEGIN IMMEDIATE` transaction 内完成，避免并发 run 争用同一 session。
- `sessions.status` 的 CHECK 不包含 `waiting_for_tool`、`waiting_for_approval`、`cancelling`。这些 active 状态只能由 `runs.status` 和 `one_active_run_per_session` 约束表达。
- append 时先读取当前表内该 session 的最大 `seq`，新事件使用 `max(seq)+1`；同一 transaction 内写入，冲突时重试或返回 `store.concurrent_write`。

## 14. Provider Strategy

Phase 0 必须有一个真实 provider。建议：

- 首选 OpenAI-compatible Chat Completions adapter。
- 同时实现 MockProvider 做测试。

原因：

- OpenAI-compatible Chat Completions 覆盖 OpenAI、OpenRouter、vLLM、Ollama、LM Studio、DeepSeek/Qwen compatible endpoints 等常见本地和远程后端。
- Adapter 需要 capability-driven：不能假设所有 compatible endpoint 都支持 streaming、tools 或 JSON mode。
- 若 endpoint 支持 OpenAI-style `tools` / `tool_calls`，优先走 native tool calling。
- 若 endpoint 不支持 tool calling，走 JSON fallback tool-call mode。
- MockProvider 保证 replay 和 CI 稳定。

Phase 0 不做 provider fallback。provider 配置失败时，REPL 应清楚提示用户配置 base URL、API key 或模型名称。

## 15. 测试和验收

### 15.1 单元测试

- protocol types compile。
- Zod schema validation。
- workspace path policy。
- file.write policy：overwrite existing file 和 append existing file 都触发 approval。
- Kysely migrations and append/read。
- Effect run cancellation / timeout / typed error mapping。
- provider event mapping。
- terminal reason mapping。
- LogTape logger category/redaction helper。

### 15.2 集成测试

- REPL 外的 SDK create session -> run -> final。
- provider mock emits file.read -> tool executes -> final。
- shell.run exit 1 被作为 terminal result 返回。
- file.write overwrite 触发 approval。
- file.write append existing file 触发 approval。
- approval denied 写入 denied tool result。
- MockProvider 覆盖 completed、tool_denied、model_error、context_blocked 至少四类终止路径。
- session 落盘后可 list/open。
- session 落盘后可通过 SDK 读取 runtime events、provider events、approvals 和 artifacts。

所有自动测试使用 Vitest，默认 root 命令为 `pnpm test`，底层执行 `vitest run`。

### 15.3 手工验收

在一个小 TypeScript 项目中，用户能运行：

```text
mineco
```

然后输入：

```text
找出测试失败原因并修复
```

Phase 0 合格表现：

- agent 能列文件、读相关文件、运行测试。
- agent 能提出并执行文件修改，必要时请求 approval。
- REPL 展示工具调用和测试输出。
- 最终说明改了什么、跑了什么验证。
- `.mineco/runtime.db` 中能看到 session 历史，`.mineco/artifacts/` 中保存大输出 artifact。

## 16. Phase 0 到 Phase 1 的升级路径

Phase 1 不重写 Phase 0，而是在同一产品上增强：

- 增加 diff view。
- 增加 test view。
- 增加 interrupt/cancel 的完整处理。
- 增加 `file.patch` 或 `git.apply_patch`。
- 增加 replay tests。
- 增加 provider state 缺失恢复。
- 增加大输出 artifact viewer。

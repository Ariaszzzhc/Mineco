# AI Agent Runtime 设计

版本：0.1 草案

状态：设计提案

相关文档：[Agent Runtime 协议](../protocol/agent-runtime-protocol.md)

开发工作流：

- [开发工作流和规范](../process/development-workflow-and-standards.md)

阶段架构：

- [开发计划](../roadmap/development-plan.md)
- [Phase 0 本地 Agent 执行架构](../roadmap/phase-0-local-agent-execution.md)

语言：中文

## 1. 设计目标

这个 agent runtime 的目标不是再封装一个 chat API，而是提供一个可长期演进的 agent 执行平台：

- 能接入 OpenAI、Anthropic、Google Gemini、Mistral、DeepSeek、Qwen、Ollama、vLLM、OpenRouter 等供应商。
- 能保留不同供应商的高级能力，而不是把所有模型压成最弱的 text-in/text-out。
- 支持 agent skills、MCP servers、内置 tools、外部 connectors、插件包和用户自定义工具。
- 支持长任务、工具调用、审批、沙箱、上下文压缩、恢复、检查点、任务调度和可观测性。
- 第一产品形态从 REPL-style 本地 coding agent 开始，后续演进到 coding TUI，同时保留未来复用到 CLI、桌面端、Web IDE、后台 worker、自动化任务的边界。
- 保持核心协议稳定，把供应商差异、工具差异、产品 UI 差异隔离在边界层。

## 2. 分层架构

```text
Client / Product Surface
  首先是 REPL-style local coding app，之后是 TUI、CLI、桌面端、Web app、IDE 插件、
  API server、scheduler UI

Agent Application Layer
  Agent definition、用户设置、工作区选择、鉴权、UI 状态、
  产品策略、持久化编排

Agent Core
  Agent loop、上下文准备、模型调用、工具执行编排、
  状态转移、取消、压缩、checkpoint

Capability Layer
  Skill registry、tool registry、MCP registry、connector registry、
  权限规划器、能力解析器

Provider Layer
  Provider registry、model catalog、provider adapter、fallback adapter、
  路由、重试、限流、用量计量

Tool Execution Layer
  内置 tools、MCP clients、本地进程 tools、browser tools、
  file tools、shell tools、sandbox、approvals、audit logs

State Layer
  Session store、event log、artifact store、memory store、vector index、
  provider state、checkpoints、secrets references

Logging Layer
  LogTape diagnostic logging、category routing、redaction、local sinks、
  optional future OpenTelemetry/file sinks
```

核心边界：

- Agent Core 不依赖任何供应商 SDK。
- Provider Adapter 不执行 tools，不做审批，不读写用户文件。
- Tool Runtime 不决定模型行为，只验证、授权、执行和记录。
- Skills 不直接获得系统权限，它们只能声明能力需求，由 runtime 解析成可见 tools 和 instructions。
- MCP server 是工具来源之一，不是权限来源；权限仍由 Tool Runtime 和 Runtime Policy 决定。

## 3. 核心概念模型

### 3.1 AgentDefinition

`AgentDefinition` 是一个可版本化的 agent 配置，用来描述“这个 agent 是什么、能做什么、运行时如何约束它”。

```ts
interface AgentDefinition {
  id: string;
  version: string;
  name: string;
  description?: string;
  instructions: InstructionBlock[];
  defaultModel: ModelSelector;
  modelPolicy?: ModelPolicy;
  skills?: SkillRef[];
  tools?: ToolRef[];
  mcpServers?: McpServerRef[];
  connectors?: ConnectorRef[];
  memory?: MemoryPolicy;
  permissions?: RuntimePolicy;
  context?: ContextPolicy;
  output?: OutputPolicy;
  lifecycle?: LifecycleHooks;
  metadata?: Record<string, unknown>;
}
```

`AgentDefinition` 要允许三种来源叠加：

- 系统内置 agent：第一内置目标是 coding agent，后续再扩展 research、office-doc、browser-agent。
- 工作区 agent：项目根目录里的 `.agent/agent.json` 或 `.codex/agent.json`。
- 用户自定义 agent：用户配置目录、工作区模板、本地 registry。

### 3.2 AgentSession

`AgentSession` 是一次任务执行的状态容器。ARP 草稿里的 `AgentSession` 是底层协议的源真相，这里扩展产品运行时需要的字段：

```ts
interface RuntimeSession {
  id: string;
  agentId: string;
  status: RuntimeSessionStatus;
  terminalReason?: TerminalReason;
  workspace?: WorkspaceRef;
  task: UserTask;
  items: AgentItem[];
  providerState?: ProviderState;
  runtimeState: RuntimeState;
  checkpoints: CheckpointItem[];
  usage?: Usage;
  artifacts: ArtifactRef[];
  createdAt: string;
  updatedAt: string;
}
```

底层原则仍然是：transcript 是源真相，provider state 只是优化。

`usage` 使用 ARP 的可选 `Usage`。Phase 0-3 可以为空或只有 token 估算；精确 cost、per-provider ledger 和 token/cost 汇总属于 Phase 4 Provider Abstraction 的用量账本扩展，不作为早期 `RuntimeSession` 必填字段。

### 3.3 AgentRun

`AgentRun` 是 session 中一次可恢复的执行片段。一个 session 可以包含多个 run，例如用户中途补充信息、审批后继续、定时唤醒继续。

```ts
interface AgentRun {
  id: string;
  sessionId: string;
  attempt: number;
  status: RunStatus;
  terminalReason?: TerminalReason;
  startedAt: string;
  endedAt?: string;
  trigger: "user" | "approval" | "scheduler" | "resume" | "api";
  inputItemIds: string[];
  outputItemIds: string[];
  error?: AgentError;
}
```

状态枚举以 ARP 的 `RunStatus` 和 `RuntimeSessionStatus` 为唯一源真相。`RuntimeSessionStatus` 只表达 session 生命周期和是否正在执行；`waiting_for_tool`、`waiting_for_approval`、`cancelling` 只属于 active `RunStatus`，不得写入 `RuntimeSession.status`。`terminated` 不是 status。Runtime 层不定义 `run.terminated` 事件；provider 的 `RunTerminatedEvent` 只作为 provider event 落盘，runtime adapter 必须映射成 `run.completed`、`run.failed` 或 `run.cancelled`。

`RuntimeSession` DTO 不内联事件流。Runtime events 和 provider events 分别通过 event log / Store API 读取，对应 `runtime_events` 和 `provider_events` 两类 append-only log。

## 4. Instruction 体系

不要把所有提示词拼成一个字符串。runtime 应该把指令拆成可排序、可审计、可裁剪的块。

```ts
interface InstructionBlock {
  id: string;
  role:
    | "system"
    | "developer"
    | "agent"
    | "skill"
    | "workspace"
    | "user_preference"
    | "runtime_policy";
  priority: number;
  content: Content[];
  stable?: boolean;
  scope?: "global" | "session" | "turn" | "tool";
  source?: string;
}
```

优先级建议：

1. Runtime safety policy。
2. Product/system instructions。
3. AgentDefinition instructions。
4. Active skill instructions。
5. Workspace/project instructions。
6. User preferences。
7. Current task instructions。

冲突处理：

- 高优先级覆盖低优先级。
- tool 权限不能被 prompt 提升，只能由 policy 提升。
- skill 只能收窄行为，不能绕过 runtime safety。
- 所有注入到模型的 instruction block 都要保留 `source`，便于调试。

## 5. 多供应商和模型能力

### 5.1 ProviderRegistry

```ts
interface ProviderRegistry {
  listProviders(): ProviderDescriptor[];
  getProvider(id: string): AgentProtocolProvider;
  listModels(filter?: ModelFilter): ModelDescriptor[];
  resolve(selector: ModelSelector, task: TaskProfile): Promise<ModelResolution>;
}
```

### 5.2 ModelDescriptor

```ts
interface ModelDescriptor {
  provider: string;
  model: string;
  aliases?: string[];
  modality: {
    textInput: boolean;
    imageInput: boolean;
    audioInput?: boolean;
    fileInput?: boolean;
    textOutput: boolean;
    imageOutput?: boolean;
    audioOutput?: boolean;
  };
  agentCapabilities: ProviderCapabilities;
  limits: {
    maxInputTokens: number;
    maxOutputTokens: number;
    maxToolCallsPerStep?: number;
  };
  cost?: {
    inputPerMTok?: number;
    outputPerMTok?: number;
    cachedInputPerMTok?: number;
  };
  qualityHints?: {
    coding?: number;
    reasoning?: number;
    toolUse?: number;
    latency?: number;
  };
}
```

### 5.3 ModelSelector

```ts
type ModelSelector =
  | { type: "fixed"; provider: string; model: string }
  | { type: "alias"; name: "fast" | "balanced" | "strong" | "local" }
  | { type: "policy"; policyId: string };
```

### 5.4 路由策略

默认不要做过度自动路由。第一版建议：

- 用户或 agent 明确指定主模型。
- fallback 只用于 provider 临时错误、限流、上下文不支持、模型不可用。
- fallback 前要检查 capability，不允许从支持 native tools 的模型无提示降级到不可靠 JSON shim，除非 task policy 允许。
- 对高风险工具任务，不自动跨供应商重试，避免不同供应商看到更多敏感上下文。

```ts
interface ModelPolicy {
  allowedProviders?: string[];
  deniedProviders?: string[];
  allowFallback: boolean;
  fallbackModels?: ModelSelector[];
  requireCapabilities?: Partial<ProviderCapabilities>;
  maxCostUsd?: number;
  dataResidency?: "any" | "local_only" | "region_locked";
}
```

## 6. Agent Skills 设计

Skill 是可安装、可版本化、可组合的能力包。它不等价于 tool；skill 通常包含说明、工作流、上下文选择规则、示例、模板和可选脚本。

本 runtime 第一版应兼容现有 Agent Skills 标准，而不是自创一个不兼容包格式。标准 skill 的最小结构是一个目录加必需的 `SKILL.md`：

```text
skill-name/
  SKILL.md
  agents/
    openai.yaml
  scripts/
  references/
  assets/
```

`SKILL.md` 必须包含 YAML frontmatter，且 runtime 用 `name` 和 `description` 做发现和触发判断：

```yaml
---
name: typescript-coding
description: TypeScript coding workflows, testing, debugging, and project-specific implementation guidance. Use when the agent needs to inspect, edit, test, or review TypeScript code.
---
```

body 是触发后才加载的 Markdown 指令。`scripts/`、`references/`、`assets/` 按需加载，遵循渐进披露：metadata 常驻，`SKILL.md` 触发后加载，大型资源只在需要时读取或执行。

### 6.1 SkillPackage

```text
skill/
  SKILL.md
  agents/
    openai.yaml
  references/
  templates/
  assets/
  scripts/
  tests/
```

`skill.json` 不作为标准必需文件。为了兼容生态，runtime 的主路径只依赖 `SKILL.md` frontmatter；如果某些插件额外提供 `skill.json`，只能作为扩展 metadata 读取，不能成为 Agent Skills 兼容性的前提。

```ts
interface SkillManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  activation: SkillActivation;
  source: {
    path: string;
    standard: "agent-skills";
    skillMdPath: string;
    openaiYamlPath?: string;
  };
  instructions: SkillInstructionRef[];
  toolHints?: SkillToolHint[];
  mcpHints?: McpServerHint[];
  resources?: SkillResourceRef[];
  scripts?: SkillScriptRef[];
  policyHints?: SkillPolicyHint[];
  compatibility?: {
    minRuntimeVersion?: string;
    providers?: string[];
    platforms?: string[];
  };
}

interface SkillToolHint {
  source: "allowed-tools";
  pattern: string;
  availability?: "available" | "missing" | "policy_blocked";
  reason?: string;
}

interface McpServerHint {
  serverName: string;
  reason?: string;
}

interface SkillPolicyHint {
  kind: "requested_capability" | "risk_note" | "setup_note";
  description: string;
}
```

`SkillManifest` 是 runtime 加载 `SKILL.md` 后生成的内部归一化结构，不要求 skill 作者手写。`toolHints`、`mcpHints` 和 `policyHints` 只用于解释和 UI，不授予权限、不阻止激活、不改变 RuntimePolicy、approval、sandbox、tool visibility、tool availability 或 activation。真正的 `RuntimePolicyPatch` 只能来自可信 `policy`、`user_global`、`workspace_local`、`cli_override` 或明确受信的 plugin/connector 配置来源，不能由 `SKILL.md` 或 workspace shared skill 内容直接提供。

### 6.2 SkillActivation

```ts
interface SkillActivation {
  mode: "explicit" | "semantic" | "file_pattern" | "always";
  triggers?: string[];
  filePatterns?: string[];
  mimeTypes?: string[];
  priority?: number;
}
```

激活规则：

- explicit：用户或 agent definition 明确指定。
- semantic：根据任务语义匹配，但必须可解释。
- file_pattern：例如 `.docx`、`.pptx`、`package.json`。
- always：只用于很小的全局 skill，谨慎使用。

Phase 3 只支持 `explicit`、`file_pattern`、`semantic` 和受限 `always`。`tool_request` 风格的激活属于 Phase 5/6 future：例如用户明确要求 browser verification、GitHub、Google Drive 或其他 connector 能力时，再由 connector/plugin 层和对应 runtime policy 决定是否激活相关 workflow。Phase 3 不把这些能力纳入 gate。

### 6.3 Skill 运行时行为

Skill 被激活后，runtime 做四件事：

1. 扫描 skill 目录，读取 `SKILL.md` frontmatter。
2. 根据 `name`、`description`、用户显式选择和任务语义决定是否触发。
3. 触发后读取 `SKILL.md` body，生成 `InstructionBlock`。
4. 按需读取 `references/`，执行或检查 `scripts/`，引用 `assets/`。
5. 记录标准 `allowed-tools` hints 并写入 `skill_tool_hints` 解释状态；最终 tool visibility、availability、approval 和 sandbox 仍由 ToolRegistry、ToolRuntime 和 RuntimePolicy 决定。

Skill 不能：

- 绕过审批。
- 自行读取 secrets。
- 自动启用未授权 MCP server。
- 把任意本地文件塞进上下文。
- 强制使用某个 provider，除非 agent policy 允许。

### 6.4 Coding Skills

第一目标是 coding agent，因此 Phase 3 required builtin skills 优先覆盖：

- `coding-core`：代码检索、编辑、测试、验证、最终汇报的通用工作流。
- `repo-orientation`：读取项目结构、依赖、脚本、测试入口、贡献规范。
- `typescript-coding`：TypeScript/JavaScript 项目的构建、类型检查、测试和常见框架习惯。
- `git-workflow`：status、diff、branch、commit、PR 准备，但 push/release 仍走高风险审批。
- `code-review`：按 bug/risk/test gap 输出 review findings。

这些 skills 都使用标准 `SKILL.md` 目录结构；runtime 可以内置它们，也可以从用户或工作区 skill 目录加载。

Future builtin skills：

- `frontend-verification`：前端项目启动 dev server、浏览器检查、截图验证，正式验收属于 Phase 5。
- connector-oriented skills：GitHub、Google Drive 等 connector workflow，属于 Phase 6+ 插件/connector 扩展，不属于 Phase 3 gate。

## 7. Tool / MCP / Connector 统一模型

### 7.1 Capability Source

所有可调用能力统一建模为 `CapabilitySource`：

```ts
type CapabilitySource =
  | BuiltInToolSource
  | LocalToolSource
  | McpToolSource
  | ConnectorToolSource
  | SkillScriptSource;
```

每个 source 暴露一组 `ToolSpec`，但权限、审批、审计在 ToolRuntime 中统一处理。

### 7.2 ToolSpec 扩展

ARP 草稿里的 `ToolSpec` 建议扩展：

```ts
interface RuntimeToolSpec extends ToolSpec {
  id: string;
  namespace: string;
  origin: CapabilitySourceRef;
  visibility: ToolVisibility;
  availability: ToolAvailability;
  availabilityReason?: string;
  idempotency?: "read" | "write" | "external_side_effect";
  timeoutMs?: number;
  concurrency?: {
    maxParallel?: number;
    mutexKey?: string;
  };
  resultPolicy?: {
    maxModelVisibleBytes?: number;
    summarizeLargeOutput?: boolean;
    artifactForLargeOutput?: boolean;
    redactSecrets?: boolean;
  };
}

type ToolVisibility =
  | "model_visible"
  | "runtime_only"
  | "user_only";

type ToolAvailability =
  | "available"
  | "hidden"
  | "blocked"
  | "unavailable";
```

### 7.3 MCP 集成

MCP server 作为工具、资源、prompt 的动态来源接入。

```ts
interface McpServerRef {
  id: string;
  transport: "stdio" | "http" | "sse" | "websocket";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, SecretRef | string>;
  autoStart?: boolean;
  trustLevel: "builtin" | "workspace" | "user" | "third_party";
  permissions?: RuntimePolicyPatch;
}
```

MCP 安全规则：

- MCP 暴露的 tool schema 不等于授权。
- workspace 提供的 MCP server 默认低信任，需要用户显式启用。
- MCP tool 的网络、文件、shell 权限必须显式声明或由 wrapper 限制。
- MCP resource 进入模型前必须通过 context filter。
- MCP prompt 只能作为低优先级 instruction 候选，不能覆盖 runtime policy。

### 7.4 Tool 可见性

不是所有 tool 都应该直接暴露给模型：

- `model_visible`：模型可以主动调用，例如 `file.read`、`shell.run`。
- `runtime_only`：runtime 内部使用，例如 `approval.request`、`artifact.store.write`。
- `user_only`：只由 UI 或用户操作触发，例如安装 connector、登录 OAuth。

`visibility` 只表达 tool 面向谁可见或可触发；`availability` 表达当前是否可用：

- `available`：可按 `visibility` 暴露和调用。
- `hidden`：不进入模型可见 tool snapshot，通常因为冲突、低信任、Plan mode 过滤或用户关闭。
- `blocked`：被 policy、schema validation、trust、sandbox 或 risk rule 明确阻止；TUI 必须显示 reason。
- `unavailable`：来源暂不可用，例如 MCP server disconnected、connector 未登录或本地依赖缺失。

Phase 2 的 resolver 源真相是 `ToolVisibility + ToolAvailability`。`hidden`、`blocked`、`unavailable` 不是 `ToolVisibility` 枚举值，不应被写入 `visibility` 字段。

## 8. 权限和安全模型

### 8.1 RuntimePolicy

```ts
interface RuntimePolicy {
  filesystem: FileSystemPolicy;
  network: NetworkPolicy;
  shell: ShellPolicy;
  browser: BrowserPolicy;
  secrets: SecretsPolicy;
  externalSideEffects: SideEffectPolicy;
  approvals: ApprovalPolicy;
  dataSharing: DataSharingPolicy;
}
```

### 8.2 文件系统策略

```ts
interface FileSystemPolicy {
  readRoots: string[];
  writableRoots: string[];
  deniedPaths: string[];
  maxReadBytes?: number;
  allowSymlinks?: boolean;
}
```

规则：

- 所有路径先 canonicalize，再检查 root。
- 写入默认只允许 workspace。
- 递归删除、批量移动、覆盖大文件需要审批。
- 读取 secret-like 文件要走 secrets policy。

### 8.3 沙箱选型

沙箱设计参考 Codex sandboxing 的职责划分和平台实现思路，但不采用 Codex 的配置模型。参考来源：[Codex sandboxing](https://developers.openai.com/codex/concepts/sandboxing)。

核心定义：

- Sandbox 是技术执行边界，负责限制文件、网络和进程可访问范围。
- Approval 是决策流程，负责在工具请求越过沙箱边界或触发高风险动作时询问用户。
- Sandbox 必须覆盖 spawned commands，不只覆盖 runtime 内置文件操作。`git`、包管理器、测试命令、构建命令都要继承同一组边界。
- Routine coding tasks 应该能在 workspace 边界内自主执行，减少低风险命令的审批噪音。

平台选型：

```text
macOS      -> Seatbelt-style native sandbox
Linux      -> bubblewrap-style sandbox
WSL2       -> Linux sandbox path
Windows    -> native Windows sandbox path
Fallback   -> no-sandbox with stricter approval, only for unsupported environments
```

设计约束：

- Phase 0 至少要有 workspace boundary 和 approval gate；平台原生强制沙箱可以先做成 capability detector + adapter interface。
- 如果当前平台无法启用强制沙箱，当前产品界面必须显示降级状态，并提高 shell/write 操作的审批要求。
- 沙箱失败不能静默降级成完全信任执行。
- ToolRuntime 是唯一进入 sandbox runner 的路径。

```ts
interface SandboxRuntime {
  capabilities(): Promise<SandboxCapabilities>;
  run(command: SandboxCommand, policy: SandboxExecutionPolicy): Promise<SandboxResult>;
}

interface SandboxCapabilities {
  platform: "macos" | "linux" | "wsl2" | "windows" | "unsupported";
  filesystem: boolean;
  network: boolean;
  processIsolation: boolean;
  enforced: boolean;
}

interface SandboxExecutionPolicy {
  cwd: string;
  readRoots: string[];
  writableRoots: string[];
  deniedPaths: string[];
  network: "disabled" | "enabled" | "allowlist";
  allowlistHosts?: string[];
  timeoutMs?: number;
  maxOutputBytes?: number;
}
```

### 8.4 Shell 策略

```ts
interface ShellPolicy {
  enabled: boolean;
  sandboxRequired: boolean;
  allowedPrefixes?: string[][];
  deniedCommands?: string[];
  requireApprovalFor?: ShellRiskRule[];
  maxDurationMs?: number;
  maxOutputBytes?: number;
}
```

Shell 风险分级：

- low：只读命令，例如 `ls`、`git diff`、`npm test`。
- medium：构建、安装依赖、写缓存。
- high：网络下载、启动服务、修改大量文件。
- critical：删除、部署、push、生产数据库、secret 读取。

### 8.5 Secrets 策略

Secrets 不进入 transcript。工具调用只能拿到 `SecretRef`，由具体 tool 在执行时解析。

```ts
interface SecretRef {
  provider: "env" | "vault" | "os_keychain" | "connector";
  key: string;
}
```

模型可见内容只能看到“有一个 GitHub token 可用”这类能力事实，不能看到值。

### 8.6 数据发送策略

```ts
interface DataSharingPolicy {
  allowRemoteProviders: boolean;
  allowFileContentToProvider: boolean;
  maxFileBytesPerStep?: number;
  requireApprovalForSensitiveFiles: boolean;
  redactionRules: RedactionRule[];
}
```

本项目当前只规划个人/本地 coding agent 场景。数据发送策略用于个人工作区安全边界：

- local-only 模式。
- 用户选择允许的供应商。
- 禁止把某些路径、文件类型、正则匹配内容发送给远程 provider。
- 记录每次发送到 provider 的 item 摘要和哈希，便于本地调试和审计。

## 9. 上下文和记忆

### 9.1 Context Assembly

上下文由这些层组成：

```text
Stable instructions
Runtime policy summary
Agent definition
Activated skill instructions
Workspace facts
Memory retrieval
Session summaries/checkpoints
Recent transcript
Current user message
Available tool specs
```

每个 context chunk 应该有元数据：

```ts
interface ContextChunk {
  id: string;
  source: string;
  content: Content[];
  priority: number;
  tokenEstimate?: number;
  stable?: boolean;
  sensitive?: boolean;
  expiresAt?: string;
}
```

### 9.2 Memory 类型

```ts
type MemoryScope = "session" | "workspace" | "user" | "global";

interface MemoryRecord {
  id: string;
  scope: MemoryScope;
  kind: "preference" | "fact" | "decision" | "summary" | "artifact" | "embedding";
  content: Content[];
  sourceSessionId?: string;
  confidence?: number;
  ttl?: string;
  createdAt: string;
  updatedAt: string;
}
```

记忆写入必须保守：

- 用户明确偏好可以写入 user memory。
- 项目事实写入 workspace memory 前应能追溯来源。
- 从模型推断出来的事实需要低 confidence 或等待确认。
- secrets、一次性 token、临时错误日志不能写入长期 memory。

### 9.3 Context Compaction

ARP 的 `SummaryItem` 是正确基础，并应使用 `kind` 字段表达 summary 分类：

```ts
type SummaryKind =
  | "conversation"
  | "tool_trace"
  | "workspace_state"
  | "plan"
  | "handoff"
  | "failure_recovery";
```

长任务恢复时，优先加载：

1. 最新 handoff summary。
2. 当前 plan summary。
3. 最近 checkpoint。
4. 未解决 tool call / error / approval。
5. 最近用户消息。

## 10. Agent Loop 设计

### 10.1 状态机

```text
SessionStatus:
created -> running -> waiting_for_user -> running -> completed
running -> failed
running -> cancelled
failed  -> running (manual retry creates a new run)

RunStatus transitions:
created -> running -> waiting_for_tool -> running
running -> waiting_for_approval -> running
running -> cancelling -> cancelled
running -> completed
running -> failed
```

Run 级状态使用 `RunStatus`，session 级状态使用 `RuntimeSessionStatus`。`ActiveRunStatus = "running" | "waiting_for_tool" | "waiting_for_approval" | "cancelling"`。`created`、`completed`、`failed`、`cancelled` 属于完整 `RunStatus`，但不属于 active subset，不纳入 active run 约束，也不通过 `run.status_changed` 发送。`waiting_for_user` 只属于 session status。`session.status_changed` 只发送 session status；run active 中间态通过 active run query 或 `run.status_changed` 展示。`terminated` 不是状态，终止用 terminal status + `terminalReason` 表达。

### 10.2 单步执行

```ts
interface AgentCore {
  start(input: StartSessionInput): Promise<RuntimeSession>;
  resume(sessionId: string, input?: ResumeInput): Promise<RuntimeSession>;
  cancel(sessionId: string, reason?: string): Promise<void>;
  runStep(sessionId: string): AsyncIterable<RuntimeEvent>;
}
```

单步流程：

1. 加载 session 和 agent definition。
2. 解析 active skills / tools / MCP。
3. 合并 runtime policy。
4. 选择 provider 和 model。
5. 准备 context。
6. 调用 provider adapter。
7. 消费 RunEvent。
8. 对 tool calls 进行验证、审批、执行。
9. 写 transcript、event log、artifact、usage。
10. 判断是否结束、等待用户、等待审批、继续下一轮。

### 10.3 并行工具调用

并行工具调用只在满足以下条件时允许：

- provider 支持或 fallback adapter 能可靠解析多 tool calls。
- tool specs 标记允许并发。
- 工具之间没有相同 `mutexKey`。
- runtime policy 允许并发。
- side effect tool 默认不并发。

### 10.4 中断和用户插话

用户在运行中插话时，runtime 应该支持：

- `interrupt`: 取消当前 provider stream，终止可取消工具，插入用户新消息后继续。
- `queue`: 当前 run 完成后再处理。
- `answer_status`: 不中断，仅返回状态。

## 11. Artifact 设计

大输出不应该全部塞进模型上下文。

```ts
interface ArtifactRef {
  id: string;
  sessionId: string;
  kind: ArtifactKind;
  subtype?: string;
  uri: string;
  mimeType?: string;
  sizeBytes?: number;
  sha256?: string;
  modelVisibleSummary?: Content[];
  createdAt: string;
}

type ArtifactKind =
  | "file"
  | "directory"
  | "terminal_log"
  | "screenshot"
  | "diff"
  | "dataset"
  | "report"
  | "plan"
  | "mcp_discovery"
  | "mcp_tool_output"
  | "mcp_server_log"
  | "mcp_resource"
  | "mcp_prompt"
  | "skill_reference"
  | "skill_resource"
  | "skill_script_output"
  | "browser_artifact";
```

`ArtifactKind` 是 artifact 分类的唯一源真相。`subtype` 只能用于同一 kind 下的 UI/实现细分，不能代替新增稳定 kind。Phase 1-3 引入的新 artifact 类型必须先扩展这个 union，再同步 phase 文档和测试。

策略：

- 终端输出超过阈值时，完整内容写 artifact，模型只看摘要和尾部错误。
- 图片、PDF、Office 文件用 file ref 或 rendered preview。
- diff 可以保留短 diff，长 diff 写 artifact。
- artifact 必须能被审计和清理。

## 12. Observability / Replay / Eval

### 12.1 Event Log

除 ARP 的 provider `RunEvent` 外，runtime 还需要自己的 `RuntimeEvent`：

```ts
type RuntimeEvent =
  | { type: "session.created"; session: RuntimeSession }
  | { type: "session.status_changed"; sessionId: string; status: RuntimeSessionStatus }
  | { type: "run.started"; runId: string; sessionId: string }
  | { type: "run.status_changed"; runId: string; sessionId: string; status: ActiveRunStatus }
  | { type: "run.completed"; runId: string; sessionId: string; reason: "completed" }
  | { type: "run.failed"; runId: string; sessionId: string; reason: TerminalReason; error: AgentError }
  | { type: "run.cancelled"; runId: string; sessionId: string; reason: TerminalReason }
  | { type: "context.prepared"; itemIds: string[]; tokenEstimate?: number }
  | { type: "provider.selected"; provider: string; model: string }
  | { type: "assistant.delta"; text: string }
  | { type: "assistant.message"; message: AssistantMessage }
  | { type: "tool.started"; call: ToolCallItem }
  | { type: "tool.finished"; result: ToolResultItem }
  | { type: "approval.requested"; request: ApprovalRequest }
  | { type: "approval.decided"; approvalId: string; decision: ApprovalDecision }
  | { type: "artifact.created"; artifact: ArtifactRef }
  | { type: "checkpoint.created"; checkpointId: string };
```

`RuntimeEvent` 的唯一命名规范是 dot event name。Phase 0 最小 schema 以 [Phase 0 本地 Agent 执行架构](../roadmap/phase-0-local-agent-execution.md#82-runtimeevent) 为准；长期设计只能扩展这个 union，不能改回 snake_case。

Runtime terminal event 必须三选一且只发一次：`run.completed`、`run.failed`、`run.cancelled`。Provider stream 中的 `run_terminated` 不直接暴露为 runtime event。

### 12.1.1 Diagnostic Logging

诊断日志使用 LogTape，依赖为 `@logtape/logtape`。LogTape 用于 runtime 内部观测和本地调试，不是 RuntimeEvent、provider event、approval audit 或 transcript 的替代品。

日志边界：

- RuntimeEvent：产品界面和 replay 的结构化事件源真相。
- provider_events：供应商原始 event stream 的持久化记录。
- approvals：approval request/decision 的审计源真相。
- LogTape：面向开发者和本地诊断的结构化日志。

使用规则：

- application entry point 配置 LogTape；runtime/library 模块只获取 logger。
- category 使用 `["electrolyte", component, ...]`。
- 日志字段必须 redaction，不能包含 secret、完整文件内容、原始 auth header 或未截断 terminal output。
- 日志可以引用 artifact id、session id、run id、tool call id，但不应复制 artifact 大内容。

### 12.2 Replay

Replay 分两种：

- exact replay：不重新调用模型，只重放 events，用于 UI/debug。
- deterministic replay：固定 provider response fixture，重新执行 runtime，用于测试。

测试重点：

- provider adapter event mapping。
- tool call validation。
- approval denial recovery。
- context compaction 不丢关键状态。
- provider state 丢失后 transcript replay 可继续。
- fallback JSON tool-call parser 的错误路径。

### 12.3 Metrics

最小指标：

- provider latency。
- tool latency。
- token usage。
- cost。
- tool error rate。
- approval rate / denial rate。
- compaction frequency。
- context dropped bytes。
- run completion / failure / cancellation。

## 13. Product Surface: REPL First, Coding TUI Later

第一产品入口采用 REPL-style terminal loop，目标是先跑通本地 coding agent 的执行闭环。REPL 不是 runtime 旁路，它和后续 TUI 一样只消费 Runtime SDK 和 RuntimeEvent。

TUI 是 Phase 1+ 的产品增强方向。TUI 不是薄壳，它应该是 runtime 的第一等客户端，直接暴露 agent 执行状态、工具调用、审批、diff、测试结果和上下文压缩状态。

### 13.1 REPL Surface

Phase 0 REPL 需要支持：

- 输入新任务或追问。
- 打印 assistant delta / message。
- 打印 tool.started / tool.finished 摘要。
- 对 approval.requested 提示 `y` / `n`。
- `:sessions` 查看历史 session。
- `:open <sessionId>` 打开历史 session。
- `:quit` 退出。

REPL 不能直接执行 shell、读写文件或调用 provider。所有动作都走 AgentCore / ToolRuntime。

### 13.2 TUI Layout

TUI layout 图是 target-state product model，不等同于 Phase 1 必做字段。Phase 1 只能展示已有 Runtime SDK、event log 和 store 支撑的数据；后续阶段逐步增加 panel 字段。

```text
┌────────────────────────────────────────────────────────────────────┐
│ Header: workspace, branch, model, session status                    │
├──────────────────────┬─────────────────────────────────────────────┤
│ Left pane            │ Main pane                                    │
│ - session list       │ - conversation / run events                  │
│ - active plan        │ - tool calls and results                     │
│ - changed files      │ - approvals / clarification prompts          │
│                      │ - final answer                               │
├──────────────────────┴─────────────────────────────────────────────┤
│ Bottom pane: command input, shortcuts                               │
└────────────────────────────────────────────────────────────────────┘
```

Phase 1 layout 必须包含：

- `Chat/Run`：用户任务、agent 更新、工具执行摘要。
- `Diff`：当前工作区改动，支持按文件查看。
- `Tests`：最近测试命令、失败摘要、重跑入口。
- `Tools`：工具调用队列、审批状态、被拒绝动作。
- `Context`：active plan、重要 summary、token 预算估算。
- `Logs`：详细 event log，默认折叠。

后续阶段增加：

- Phase 3：skills enabled、active skills、skill activation reason、`allowed-tools`/`skill_tool_hints` 解释状态。
- Phase 4：tokens/cost、provider/model selector、reasoning effort、usage ledger。
- Phase 5：background task status、checkpoint summary、browser/frontend verification artifacts。
- Phase 6：automation status、connector/plugin state。

### 13.3 TUI Interaction Model

TUI interaction 是长期产品模型，不等同于 Phase 1 gate。每个阶段只能实现已有 runtime API、status 和 store 契约支持的操作。

Phase 1 必须支持：

- 输入新任务或追问。
- interrupt / cancel 当前 run。
- 审批 tool call：approve once、deny、approve similar prefix。
- 查看 diff 和 artifact。
- 从历史 session resume。
- 进入/退出 read-only Plan mode，并处理 `plan_approval`。

Phase 3 增加：

- 显式启用/禁用 skill。
- 查看 `allowed-tools` hints 与 `skill_tool_hints` 解释状态。

Phase 4 增加：

- 切换 provider/model 或 reasoning effort。

Phase 5 增加：

- pause/resume 长任务。
- 创建 checkpoint，恢复到 checkpoint。
- 触发 browser/frontend verification。

快捷键建议按阶段启用：

```text
Enter       send message
Ctrl+C      interrupt current run
Ctrl+D      diff view
Ctrl+T      tests view
Ctrl+K      command palette
Tab         switch pane
Ctrl+P      pause/resume (Phase 5)
```

### 13.4 Product Surface Runtime Boundary

REPL、TUI 和未来 HTTP API 都通过内部 SDK 驱动 runtime：

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

interface EventLogQuery {
  runId?: string;
  afterSeq?: number;
  cursor?: string;
  limit?: number;
}

interface EventPage<T> {
  items: T[];
  nextCursor?: string;
}

interface RuntimeEventRecord {
  sessionId: string;
  runId?: string;
  seq: number;
  event: RuntimeEvent;
  createdAt: string;
}

interface ProviderEventRecord {
  sessionId: string;
  runId?: string;
  seq: number;
  provider: string;
  event: RunEvent;
  createdAt: string;
}

interface ApprovalQuery {
  runId?: string;
  status?: "pending" | "approved" | "denied" | "expired";
  cursor?: string;
  limit?: number;
}

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

interface ArtifactQuery {
  runId?: string;
  kind?: ArtifactKind;
  cursor?: string;
  limit?: number;
}

interface ArtifactBlob {
  ref: ArtifactRef;
  content: Content[] | Uint8Array | string;
}
```

产品界面不直接执行 shell、读写文件或调用 provider。所有动作都走 AgentCore / ToolRuntime，这样未来 HTTP API、桌面端和后台 worker 可以复用同一套执行路径。

历史 session、event log、approval log 和 artifact viewer 也必须走 Runtime SDK。`getSession` 只返回 session 当前结构化状态和 transcript items；runtime/provider event log、approvals 和 artifact content 通过上面的读取接口分页获取，TUI 不直接访问 Store。

### 13.5 Tech Choice

当前确认技术基线：

- Runtime、provider adapter、tool registry、MCP client 都使用 TypeScript。
- Runtime 采用 Node.js-first，默认使用 pnpm workspace 管理 monorepo。
- 最低 Node.js 版本为 25。
- 测试使用 Vitest；类型检查使用 TypeScript compiler。
- Schema 使用 Zod；provider/tool 边界需要 JSON Schema 时从 Zod schema 派生或单独维护。
- 诊断日志使用 LogTape，依赖 `@logtape/logtape`。
- SQLite query 和 migrations 使用 Kysely。
- Runtime 内部结构化并发、资源作用域、typed errors 和 dependency injection 使用 Effect。
- Phase 0 产品界面使用 REPL-style terminal loop，暂不引入 Ink、React Blessed 等 TUI 框架。
- TUI 后续可选 Ink、React Blessed 或更底层 terminal UI 库，但不能改变 RuntimeEvent 边界。
- 不要把 UI state 混进 session store；TUI 自己维护 pane、selection、scrollback。
- Runtime event schema 要足够稳定，REPL/TUI 只渲染事件，不理解 provider 私有 shape。

## 14. API Surface

### 14.1 TypeScript SDK

```ts
const runtime = createAgentRuntime({
  providers,
  tools,
  mcp,
  storage,
  policy,
});

const session = await runtime.createSession({
  agent: "coding",
  task: { content: [{ type: "text", text: "Fix the failing test" }] },
  workspace: { path: "/repo" },
});

for await (const event of runtime.runSession(session.id)) {
  render(event);
}
```

Phase 0 对 REPL 暴露的唯一 SDK 是 `AgentRuntime` 这一组 flat methods。`runtime.sessions.*` 这类分组 API 只能作为后续 HTTP/API client 的外观设计，不进入 Phase 0 实现基线。

### 14.2 HTTP API

HTTP API 不是第一产品目标，但接口边界应提前保持清晰，避免 TUI 与 runtime 强耦合。

```text
POST   /v1/agents
GET    /v1/agents/{id}
POST   /v1/sessions
GET    /v1/sessions/{id}
POST   /v1/sessions/{id}/runs
POST   /v1/sessions/{id}/cancel
POST   /v1/sessions/{id}/messages
GET    /v1/sessions/{id}/runtime-events
GET    /v1/sessions/{id}/provider-events
GET    /v1/sessions/{id}/approvals
GET    /v1/sessions/{id}/artifacts
GET    /v1/artifacts/{id}
POST   /v1/approvals/{id}/decision
GET    /v1/tools
GET    /v1/models
```

Streaming 使用 SSE 或 WebSocket。内部 runtime 可以继续用 `AsyncIterable<RuntimeEvent>`。

## 15. 配置格式

配置必须按来源建模，不能把所有 JSON 简单合并成同一信任级别。

建议配置来源：

```ts
type ConfigSourceKind =
  | "builtin"
  | "user_global"
  | "workspace_shared"
  | "workspace_local"
  | "cli_override"
  | "policy";

interface ConfigSource {
  kind: ConfigSourceKind;
  path?: string;
  trusted: boolean;
  canExpandPermissions: boolean;
  canEnableCodeExecution: boolean;
}
```

合并原则：

- `policy` 优先级最高，可以锁定模型、工具、MCP、hook、plugin、network 和 approval 规则。
- `cli_override` 只影响当前 run，不能绕过 `policy`。
- `user_global` 可以表达用户偏好和个人默认权限，但仍受 `policy` 限制。
- `workspace_local` 只对本机有效，适合保存 provider、secret ref、个人 MCP server 等不应提交的配置。
- `workspace_shared` 适合保存项目约定、默认 agent、推荐 skills 和只读 MCP 定义，但默认低信任。
- `builtin` 提供安全默认值和内置 agent，不应依赖外部文件存在。

安全敏感项：

- `workspace_shared` 不能扩大危险权限，不能启用 destructive auto-approval，不能自动执行 hook，不能自动启用未信任插件或外部 MCP server。
- project/workspace 配置可以请求能力，但最终是否启用由 RuntimePolicy、用户配置和 policy 决定。
- `RuntimePolicyPatch` 只能来自可信 policy/user/workspace_local/cli_override 或明确受信的 plugin/connector 配置来源。Skill package、`SKILL.md`、`allowed-tools` 和 `skill_tool_hints` 不能作为 RuntimePolicyPatch 来源。
- Deny 规则不可被低信任来源覆盖。
- 每个启用的 skill、tool、MCP server、plugin 和 hook 都必须保留来源信息，便于审计。

建议项目内共享配置：

```text
.agent/
  agent.json
  skills.json
  mcp.json
  policy.json
```

示例：

```json
{
  "id": "workspace-coding-agent",
  "version": "0.1.0",
  "name": "Workspace Coding Agent",
  "defaultModel": { "type": "alias", "name": "strong" },
  "skills": [
    { "id": "coding.typescript" },
    { "id": "github.pr-review" }
  ],
  "mcpServers": [
    { "id": "filesystem", "transport": "stdio", "trustLevel": "builtin" }
  ],
  "permissions": {
    "filesystem": {
      "readRoots": ["."],
      "writableRoots": ["."]
    },
    "network": {
      "mode": "enabled"
    }
  }
}
```

本地不提交配置可以使用 `.agent/local.json` 或用户配置目录中的 workspace entry 保存；它们可以覆盖个人偏好，但同样不能绕过 policy。

## 16. 存储设计

第一版使用 SQLite 存储 session、items、events、approvals 和 artifact metadata。Node.js 实现使用 Kysely 作为 query builder 和 migration layer，SQLite driver 使用内置 `node:sqlite`。`node:sqlite` Kysely dialect 参考 `wolfie/kysely-node-native-sqlite` 并内联到项目。Store 对 runtime 内部暴露 Effect service，对 SDK 边界转成 Promise。大 artifact 仍写文件系统。

```text
.electrolyte/
  runtime.db
  artifacts/
    {artifactId}
```

存储接口：

```ts
interface StoreSubsystems {
  sessions: SessionStore;
  events: EventStore;
  artifacts: ArtifactStore;
  memory: MemoryStore;
  locks: LockStore;
}
```

`StoreSubsystems` 是 Store implementation detail，用来描述内部子系统组合。对 AgentCore 和 Runtime SDK 暴露的实现契约统一命名为 `RuntimeStore`，其方法接口定义见 [Technology Stack 使用说明](technology-stack.md#34-store-边界)。不要同时实现两个不同 shape 的 `RuntimeStore`。

要求：

- items、runtime_events、provider_events 逻辑上 append-only。
- session summary 可覆盖更新。
- artifact content-addressable 优先。
- 写 session 时要有 lock，避免多个 worker 同时推进同一个 session。
- 支持 export/import，便于 bug report 和 eval。

## 17. 插件和扩展

### 17.1 PluginPackage

Plugin 是比 skill 更大的分发单元，可以包含 skills、tools、MCP server 定义、provider adapter、UI 扩展。

```text
plugin/
  plugin.json
  skills/
  tools/
  mcp/
  providers/
  ui/
  tests/
```

```ts
interface PluginManifest {
  id: string;
  version: string;
  name: string;
  contributes: {
    skills?: SkillManifest[];
    tools?: ToolContribution[];
    mcpServers?: McpServerRef[];
    providers?: ProviderContribution[];
    ui?: UiContribution[];
  };
  permissions?: RuntimePolicyPatch;
}
```

### 17.2 扩展加载原则

- 插件安装和启用是两步。
- 工作区插件默认不自动执行代码。
- 第三方插件必须声明权限。
- provider adapter 插件不能获得 tool runtime 权限。
- tool 插件必须通过 sandbox/wrapper 执行。

## 18. 供应商 Adapter 设计

每个 adapter 至少实现：

```ts
interface AgentProtocolProvider {
  id: string;
  capabilities(): Promise<ProviderCapabilities>;
  runStep(input: RunStepInput): AsyncIterable<RunEvent>;
  countTokens?(input: TokenCountInput): Promise<TokenCountResult>;
  compact?(input: CompactInput): Promise<CompactResult>;
}
```

Adapter 内部建议拆成：

```text
capabilities.ts
input-mapper.ts
event-mapper.ts
tool-mapper.ts
state-mapper.ts
errors.ts
client.ts
tests/
```

支持矩阵第一批：

- OpenAI-compatible Chat Completions：Phase 0 主力 adapter，覆盖常见 `/v1/chat/completions` endpoint；capability-driven 支持 streaming、OpenAI-style tools/tool_calls，以及 JSON fallback tool-call mode。
- OpenAI Responses：后续强 provider adapter，覆盖 streaming、tool calling、provider state、reasoning summary。
- Anthropic Messages：对比 adapter，验证 system/messages/tool_use/cache_control 差异。
- Local JSON Adapter：fallback adapter，验证无原生 tool calling 的路径。
- OpenRouter Adapter：作为多后端兼容层，但不要依赖它定义核心能力。

## 19. Built-in Tools

Phase 0 model-visible built-in tools：

- `file.read`
- `file.write`
- `file.list`
- `file.search`
- `shell.run`

Phase 1 model-visible built-in tools：

- `git.status`
- `git.diff`
- `git.apply_patch`

Runtime-only tools / services：

- `artifact.write`
- `artifact.read`
- `approval.request`

后续 model-visible tools：

- `browser.navigate`
- `browser.click`
- `browser.type`
- `browser.screenshot`
- `http.request`
- `task.spawn`
- `scheduler.create`
- `memory.search`
- `memory.write`

每个 tool 都要有：

- JSON schema。
- 输出 schema 或 Content[] 约定。
- 风险等级。
- 权限声明。
- 超时。
- 大输出处理策略。
- 单元测试和 golden output。

## 20. Human-in-the-loop

Agent 需要支持三类人类介入：

- approval：授权或拒绝某个动作。
- clarification：模型需要用户补充信息。
- interruption：用户改变任务、暂停、取消或要求状态。
- plan approval：用户批准一个只读规划结果进入执行阶段。

```ts
interface UserInteractionRequest {
  id: string;
  sessionId: string;
  kind: "approval" | "clarification" | "confirmation" | "plan_approval";
  prompt: Content[];
  options?: InteractionOption[];
  expiresAt?: string;
}
```

Clarification 不应滥用。runtime 可以要求 agent 在低风险、可合理假设的场景继续执行；只有不可恢复或高风险分支才问用户。

Plan mode 是 Phase 1 必做的 runtime permission mode，不是 prompt 风格、slash command 或可拖延到 Phase 5 的候选能力。进入 Plan mode 时，runtime 必须切换到只读权限集，允许探索、读取、搜索和生成计划，但禁止写文件、运行 destructive shell、提交代码或调用有外部副作用的工具。退出 Plan mode 时，runtime 必须生成 plan artifact，并通过 `plan_approval` 请求用户确认；确认后恢复进入 Plan mode 前的 permission mode，并以该计划作为执行上下文继续。Phase 1 只要求最小 read-only Plan mode、plan artifact、`plan_approval` 和恢复原 permission mode。Phase 5 只扩展复杂 plan recovery、独立 verifier、subagent/team lead 审批流和长任务中的计划对照。

## 21. Scheduler / Automation

长任务和自动化需要脱离当前 UI 线程。

```ts
interface ScheduledTask {
  id: string;
  agentId: string;
  schedule: CronLike | IntervalLike | OneShot;
  workspace?: WorkspaceRef;
  taskTemplate: UserTask;
  policy: RuntimePolicy;
  status: "active" | "paused" | "completed";
}
```

要求：

- 自动化任务必须记录触发原因。
- 低频任务可以复用 session，高频监控建议每次新 session 并链接 parent。
- 自动化默认不能执行 critical side effect，除非 policy 明确允许。
- 自动化输出要可通知、可归档、可追踪。

## 22. 错误和恢复

错误分层：

- provider error：限流、鉴权、模型不可用、上下文过长。
- adapter error：mapping bug、unsupported content。
- tool error：输入非法、执行失败、权限拒绝。
- runtime error：状态不一致、存储失败、锁冲突。
- user error：审批拒绝、缺少必要信息。

恢复策略：

- retryable provider error：指数退避，可 fallback。
- context too large：触发 compaction 后重试。
- tool validation failed：把模型可见错误反馈给模型，让模型修正。
- permission denied：反馈给模型，必要时请求用户或改用只读方案。
- storage failure：停止 run，保留最后成功 checkpoint。

## 23. 版本治理

需要同时治理四类版本：

- ARP protocol version。
- Runtime implementation version。
- AgentDefinition version。
- Skill/Plugin version。

兼容规则：

- runtime 必须能加载同 major 的旧 session。
- skill manifest 可以加 optional 字段。
- provider adapter capability 改变必须反映在 model catalog。
- transcript item schema 变更要有 migrator。

## 24. 可用版本路线

阶段必须按 agent/runtime 功能能力纵向切片推进，而不是按底层模块横向切，也不是按 UI 模块切。当前产品界面是默认验收入口；Phase 0 为 REPL，后续演进到 TUI。roadmap 的主轴是 agent 能力、供应商能力、安全策略和生态能力逐步增强。

完整开发计划见 [Development Plan](../roadmap/development-plan.md)。本节只保留阶段摘要。

### Phase 0: Local Agent Execution

目标：一个最小但可用的本地 coding agent。

用户能做：

- 在 REPL 输入 coding 任务。
- agent 能读文件、搜索文件、运行测试命令、给出修改建议或写文件。
- 用户能看到 tool calls、terminal output、最终结果。
- session 和事件能落盘，崩溃后能查看历史。

必须包含：

- REPL shell：输入 prompt、main event stream、tool output 展示。
- Runtime kernel 最小闭环。
- 一个真实 provider adapter 或本地 provider adapter。
- MockProvider 仅用于测试，不能作为产品唯一后端。
- Built-in tools：`file.read`、`file.write`、`file.list`、`file.search`、`shell.run`。
- 基础 filesystem policy：只能读写 workspace。
- SQLite session store，items/events 逻辑上 append-only。
- 最小 approval：危险 shell/write 操作前询问。

可以暂缓：

- Agent Skills 自动发现。
- MCP。
- 多 provider fallback。
- 长期记忆。
- 完整 diff/test 专用视图。

### Phase 1: Reliability and Reviewability

目标：让本地 agent 成为日常 coding 任务可依赖的工具，并引入最小 TUI shell 作为 REPL 之后的增强 interface。

用户能做：

- 查看和审阅 agent 造成的文件改动。
- 一键重跑最近测试命令。
- approve/deny 工具调用。
- interrupt / cancel 当前 run。
- 从历史 session 恢复继续。
- 在 read-only Plan mode 中先生成计划，批准后再执行。

必须包含：

- 最小 TUI shell：event stream、input、approval prompt、session header。
- Diff view。
- Test view。
- Approval UI 完整化：approve once、deny、approve similar prefix。
- read-only Plan mode：进入只读 permission mode、生成 plan artifact、发出 `plan_approval`、批准后恢复原 permission mode。
- `git.diff`、`git.status`、`git.apply_patch` 或 `file.patch`。
- 大输出 artifact 化。
- ContextManager recent-window + summary placeholder。
- Replay tests。
- Provider state 丢失后的 transcript replay。

### Phase 2: MCP and Tool Ecosystem

目标：把 MCP 作为受控工具来源接进 runtime 和当前产品 interface，并形成统一 ToolRegistry。

用户能做：

- 配置 MCP server。
- 在当前 interface 看到 MCP tools。
- 对 MCP tool 调用进行审批和审计。

必须包含：

- MCP client manager。
- Unified tool registry。
- Tool visibility and permission merge。
- MCP tool schema 到 RuntimeToolSpec 映射。
- MCP resource 进入模型前通过 context filter。
- Workspace MCP 默认低信任，需要用户启用。

### Phase 3: Agent Skills

目标：符合 Agent Skills 标准，让 coding agent 能按项目/语言/任务加载专业工作流，并复用 Phase 2 的 ToolRegistry 和权限合并边界。

用户能做：

- 安装或指向一个标准 Agent Skill 目录。
- 当前产品界面显示当前启用 skills。
- agent 根据 `SKILL.md` 使用对应 workflow。

必须包含：

- Agent Skills standard loader：扫描 `SKILL.md`，读取 `name` / `description`。
- Skill activation resolver。
- Skill body progressive loading。
- Built-in coding skills：repo orientation、typescript-coding、git-workflow、code-review。
- Context view：显示 active skills、主要 instructions、token 预算。
- Skill 只能记录标准 `allowed-tools` hints，并通过 `skill_tool_hints` 做 UI 解释；不能声明 required/optional tool requirement schema，也不能绕过 runtime policy。

### Phase 4: Provider Abstraction

目标：供应商接入开始扩展，但仍保持同一个 runtime event stream 和 provider-neutral interface。

用户能做：

- 在当前 interface 选择模型。
- 在 provider 不可用时使用安全 fallback。
- 查看当前 provider/model/cost/token。

必须包含：

- OpenAI-compatible Chat Completions adapter。
- OpenAI Responses adapter。
- Anthropic Messages adapter。
- Local JSON fallback adapter。
- Provider capability tests。
- Recorded fixture replay tests。
- Model selector。
- Capability-driven fallback。
- Usage ledger。

### Phase 5: Long-Running Coding Agent

目标：支持更长、更复杂、可恢复的 coding 任务。

用户能做：

- 让 agent 持续修复一组失败测试。
- 中途暂停、恢复、插话。
- 使用 browser 验证前端任务。
- 在必要时生成 checkpoint。

必须包含：

- Checkpoints。
- Runtime compaction。
- Browser/file artifacts。
- Frontend verification path。
- Focused code review mode。
- Phase 1 Plan mode 的长任务扩展：复杂 plan recovery、独立 verifier、subagent/team lead 审批流和计划对照。
- Memory store。
- Metrics and tracing。
- 受限 subagent / worker 设计边界，为未来 agent team / swarm 扩展预留。

### Phase 6: Automation and Extensibility

目标：从本地交互式 agent 扩展到后台任务、本地 API 和插件扩展。

用户能做：

- 创建定时 coding/check 任务。
- 导出本地运行日志。
- 管理个人 provider 和数据发送配置。

必须包含：

- HTTP/SSE API。
- Scheduler。
- Plugin package。
- Provider adapter plugin API。
- local registry。
- Eval harness。

## 25. 关键设计决策

1. ARP 继续作为 provider-neutral execution protocol，不把 skill、MCP、memory 全塞进 provider 协议。
2. Agent runtime 总设计建立在 ARP 之上，负责 agent definition、capability resolution、policy、storage、scheduler。
3. ToolRuntime 是唯一执行边界，MCP 和插件都不能绕过它。
4. Skills 是 instruction + resource + tool hints 的包，不是任意代码执行入口；Phase 3 只记录标准 `allowed-tools` 提示，不定义 required/optional 权限 schema。
5. Provider state 只是性能优化，session transcript 和 checkpoints 才能恢复任务。
6. 多供应商接入靠 capability-driven adapter，不靠统一 prompt 魔法。
7. 阶段按 agent/runtime 功能能力纵向切片推进；当前产品界面是第一 interface，但不是 roadmap 主轴。
8. 第一产品目标从 REPL-style coding agent 开始，后续演进到 coding TUI；产品界面通过 Runtime SDK 消费事件，不直接执行工具或调用供应商。
9. Agent Skills 兼容现有 `SKILL.md` 标准，`skill.json` 只能作为可选扩展 metadata。
10. 第一内置 agent 是 coding agent，优先覆盖 repo orientation、编辑、测试、diff、review、前端验证。

## 26. 已确认决策和仍需确认的问题

已确认：

- 第一产品形态：REPL-style terminal 程序，后续演进到 TUI。
- 第一目标任务：coding agent。
- Skill 格式：符合 Agent Skills 标准，优先兼容 `SKILL.md`。
- Runtime 技术基线：Node.js + TypeScript。
- 最低 Node.js 版本：25。
- 测试：Vitest。
- Schema：Zod。
- Phase 0 store：Kysely + Node.js `node:sqlite`。
- Phase 0 structured concurrency：Effect。
- Phase 0 provider：OpenAI-compatible Chat Completions。

仍需确认：

1. 默认运行环境是本机进程、容器、远程 worker，还是三者都要支持？
2. MCP server 是用户手动配置为主，还是要支持插件自动带 MCP server？
3. 长期记忆默认开启还是 opt-in？
4. Phase 5 受限 subagent 实验是否进入正式实现，还是只保留设计边界？

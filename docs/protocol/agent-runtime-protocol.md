# Agent Runtime 协议

版本：0.1 草案

状态：提案

语言：供应商中立的 agent 执行协议

相关 runtime 设计：[AI Agent Runtime 设计](../architecture/agent-runtime-design.md)

## 1. 目的

Agent Runtime Protocol，简称 ARP，定义 agent runtime 与模型供应商之间的供应商中立契约。

这个协议面向不止能聊天的 agent。符合协议的 agent 可以检查上下文、调用工具、观察结果、继续推理、从失败中恢复、压缩长历史，并以结构化结果完成任务。

ARP 不是 chat completion API 的包装层，而是 agent loop 的执行协议。

## 2. 目标

ARP 有以下目标：

- 让一个 agent runtime 能接入多个模型供应商。
- 保留 native tool calling、streaming、prompt caching、provider state、context compaction 等供应商高级能力。
- 避免把所有供应商都降级成最弱的通用 chat interface。
- 用结构化事件表示 agent 执行轨迹。
- 把工具调用、工具结果、审批、terminal output、diff、screenshot 和错误都作为一等数据。
- 通过 transcript replay、state checkpoints 和 context compaction 支持长任务。
- 把 provider-specific 行为限制在 provider adapter 内。
- 把工具执行和安全策略限制在 tool runtime 内。

## 3. 非目标

ARP 不尝试：

- 定义一个让所有模型表现完全一致的通用 prompt 格式。
- 强制所有供应商暴露同样的 reasoning 数据。
- 替代供应商 SDK。
- 标准化 billing、authentication、deployment 或 rate-limit contract。
- 保证不同供应商输出确定一致。
- 隐藏所有模型能力差异。

## 4. 架构

ARP 假设有三个主要层级，外加工具执行边界。

```text
Agent Application
  拥有用户体验、任务入口、设置、UI 和持久化。

Agent Core
  拥有执行循环：准备上下文、调用模型、执行工具、追加 observation、
  压缩历史、checkpoint 状态，并判断任务何时完成。

Provider Adapter
  把 ARP 请求和事件映射到具体供应商 API，例如 OpenAI
  Responses、Anthropic Messages、Gemini 或本地模型 runtime。

Tool Runtime
  执行工具。强制权限、approval 规则、sandbox policy 和
  结构化结果格式。
```

Agent Core 不能依赖 OpenAI、Anthropic、Gemini 或任何供应商私有 response shape。

Provider Adapter 不能直接执行工具。

Tool Runtime 不能决定模型行为。

## 5. 核心循环

典型 ARP 循环如下：

```text
1. 接收用户任务。
2. 构建或加载 AgentSession。
3. 在 token budget 内准备上下文。
4. 调用 provider.runStep(input)。
5. 消费 RunEvent stream。
6. 如果模型发出 tool call，请 ToolRuntime 执行。
7. 把 ToolResultItem 追加到 transcript。
8. 重复执行，直到产生 final=true 的 AssistantMessage。
9. 持久化最终 transcript、provider state、usage 和 checkpoints。
```

伪代码：

```ts
while (!session.done) {
  const prepared = await contextManager.prepare(session.items, budget);

  const events = provider.runStep({
    model,
    instructions,
    items: prepared,
    tools: toolRegistry.visibleTools(session),
    state: session.providerState,
    options,
  });

  for await (const event of events) {
    await eventLog.append(event);

    if (event.type === "tool_call_done") {
      const result = await toolRuntime.execute(event.call, session.policy);
      session.items.push(event.call);
      session.items.push(result);
    }

    if (event.type === "message_done") {
      session.items.push(event.message);
      session.done = event.message.final === true;
    }

    if (event.type === "provider_state") {
      session.providerState = event.state;
    }
  }
}
```

## 6. 协议接口

### 6.1 模型供应商

```ts
interface AgentProtocolProvider {
  id: string;

  capabilities(): Promise<ProviderCapabilities>;

  runStep(input: RunStepInput): AsyncIterable<RunEvent>;

  countTokens?(input: TokenCountInput): Promise<TokenCountResult>;

  compact?(input: CompactInput): Promise<CompactResult>;
}
```

`runStep` 是必需操作。`countTokens` 和 `compact` 是可选操作，因为不是所有供应商都支持 native token counting 或 context compaction。

### 6.2 RunStepInput

```ts
interface RunStepInput {
  model: string;
  instructions: string;
  items: AgentItem[];
  tools: ToolSpec[];
  state?: ProviderState;
  options?: RunOptions;
  metadata?: Record<string, unknown>;
}
```

字段：

- `model`：供应商私有模型标识。
- `instructions`：高优先级 runtime instructions。
- `items`：结构化执行 transcript。
- `tools`：本 step 可用的 tools。
- `state`：不透明的 provider continuation state。
- `options`：temperature、max output tokens、reasoning effort 等 runtime 选项。
- `metadata`：trace IDs、user IDs、task IDs 或应用私有标签。

### 6.3 RunOptions

```ts
interface RunOptions {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  stop?: string[];
  parallelToolCalls?: boolean;
  reasoning?: ReasoningOptions;
  cache?: CacheOptions;
  timeoutMs?: number;
}
```

### 6.4 ReasoningOptions

```ts
interface ReasoningOptions {
  effort?: "none" | "low" | "medium" | "high" | "xhigh";
  summary?: "none" | "auto" | "concise" | "detailed";
  encrypted?: boolean;
}
```

Provider adapter 可以忽略不支持的 reasoning 选项，但必须通过 capabilities 暴露支持情况。

### 6.5 CacheOptions

```ts
interface CacheOptions {
  mode?: "auto" | "disabled";
  stablePrefixLength?: number;
  hints?: CacheHint[];
}

interface CacheHint {
  itemId: string;
  priority: "low" | "normal" | "high";
  stable: boolean;
}
```

Cache hints 是建议性的。Provider adapter 可以把它们翻译成供应商私有 prompt caching 能力，也可以忽略。

### 6.6 Token 计数

Token counting 是可选能力，因为有些供应商无法在执行前暴露准确 token 计数。

```ts
interface TokenCountInput {
  model: string;
  instructions?: string;
  items: AgentItem[];
  tools?: ToolSpec[];
  options?: RunOptions;
}

interface TokenCountResult {
  inputTokens: number;
  toolTokens?: number;
  byItem?: Array<{
    itemId: string;
    tokens: number;
  }>;
  estimated: boolean;
}
```

如果无法精确计数，adapter 可以返回 `estimated=true` 的估算值。Context manager 必须保守使用估算。

## 7. Agent Items

Transcript 是 `AgentItem` 列表。

```ts
type AgentItem =
  | UserMessage
  | AssistantMessage
  | ToolCallItem
  | ToolResultItem
  | SystemObservation
  | SummaryItem
  | CheckpointItem;
```

每个 item 都应该有 ID 和 timestamp。

```ts
interface BaseItem {
  id: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}
```

### 7.1 UserMessage

```ts
interface UserMessage extends BaseItem {
  type: "user_message";
  content: Content[];
}
```

### 7.2 AssistantMessage

```ts
interface AssistantMessage extends BaseItem {
  type: "assistant_message";
  content: Content[];
  final?: boolean;
}
```

`final=true` 表示 agent loop 应该停止，除非 application 显式继续。

### 7.3 ToolCallItem

```ts
interface ToolCallItem extends BaseItem {
  type: "tool_call";
  callId: string;
  name: string;
  input: unknown;
  providerCallId?: string;
}
```

`callId` 由 agent runtime 分配。`providerCallId` 在存在时保留供应商原生 tool call ID。

### 7.4 ToolResultItem

```ts
interface ToolResultItem extends BaseItem {
  type: "tool_result";
  callId: string;
  status: "ok" | "error" | "denied" | "cancelled";
  content: Content[];
  error?: ToolError;
}
```

```ts
interface ToolError {
  code: string;
  message: string;
  retryable: boolean;
  details?: unknown;
}
```

### 7.5 SystemObservation

```ts
interface SystemObservation extends BaseItem {
  type: "system_observation";
  source: "runtime" | "sandbox" | "user_approval" | "scheduler" | "external";
  content: Content[];
}
```

System observation 表示不是直接用户消息或工具输出的 runtime fact，例如 sandbox 状态、approval 决策或恢复任务通知。

### 7.6 SummaryItem

```ts
interface SummaryItem extends BaseItem {
  type: "summary";
  kind: SummaryKind;
  scope: {
    fromItemId: string;
    toItemId: string;
  };
  content: Content[];
  lossiness: "lossless" | "low" | "medium" | "high";
}

type SummaryKind =
  | "conversation"
  | "tool_trace"
  | "workspace_state"
  | "plan"
  | "handoff"
  | "failure_recovery";
```

Summary item 由 context compaction、Plan mode 或恢复流程创建。Plan mode 的结构化计划必须保存为 `SummaryItem(kind="plan")`，大计划内容可以同时写入 artifact，并在 summary content 中保留 artifact ref。

### 7.7 CheckpointItem

```ts
interface CheckpointItem extends BaseItem {
  type: "checkpoint";
  label: string;
  itemsHash: string;
  providerState?: ProviderState;
  content?: Content[];
}
```

Checkpoint 用于恢复、调试和长任务 resume。

## 8. Content 类型

```ts
type Content =
  | TextContent
  | JsonContent
  | ImageContent
  | FileRefContent
  | DiffContent
  | TerminalContent
  | BinaryRefContent;
```

### 8.1 TextContent

```ts
interface TextContent {
  type: "text";
  text: string;
}
```

### 8.2 JsonContent

```ts
interface JsonContent {
  type: "json";
  value: unknown;
}
```

### 8.3 ImageContent

```ts
interface ImageContent {
  type: "image";
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  data?: string;
  uri?: string;
  alt?: string;
}
```

`data` 是 base64 编码的图片数据。`uri` 指向本地或远程图片引用。

### 8.4 FileRefContent

```ts
interface FileRefContent {
  type: "file_ref";
  path?: string;
  uri?: string;
  mimeType?: string;
  description?: string;
}
```

### 8.5 DiffContent

```ts
interface DiffContent {
  type: "diff";
  format: "unified";
  diff: string;
}
```

### 8.6 TerminalContent

```ts
interface TerminalContent {
  type: "terminal";
  command?: string;
  cwd?: string;
  stdout: string;
  stderr?: string;
  exitCode: number;
  durationMs?: number;
}
```

### 8.7 BinaryRefContent

```ts
interface BinaryRefContent {
  type: "binary_ref";
  uri: string;
  mimeType: string;
  sizeBytes?: number;
  sha256?: string;
}
```

二进制数据通常应该通过引用传递，而不是 inline。

## 9. Run Events

Provider 会发出 `RunEvent` stream。

```ts
type RunEvent =
  | TextDeltaEvent
  | MessageDoneEvent
  | ToolCallStartedEvent
  | ToolCallDeltaEvent
  | ToolCallDoneEvent
  | ReasoningSummaryEvent
  | UsageEvent
  | ProviderStateEvent
  | ErrorEvent
  | RunTerminatedEvent;
```

### 9.1 TextDeltaEvent

```ts
interface TextDeltaEvent {
  type: "text_delta";
  itemId?: string;
  text: string;
}
```

### 9.2 MessageDoneEvent

```ts
interface MessageDoneEvent {
  type: "message_done";
  message: AssistantMessage;
}
```

### 9.3 ToolCallStartedEvent

```ts
interface ToolCallStartedEvent {
  type: "tool_call_started";
  callId: string;
  name: string;
}
```

### 9.4 ToolCallDeltaEvent

```ts
interface ToolCallDeltaEvent {
  type: "tool_call_delta";
  callId: string;
  delta: unknown;
}
```

### 9.5 ToolCallDoneEvent

```ts
interface ToolCallDoneEvent {
  type: "tool_call_done";
  call: ToolCallItem;
}
```

### 9.6 ReasoningSummaryEvent

```ts
interface ReasoningSummaryEvent {
  type: "reasoning_summary";
  content: Content[];
  encrypted?: string;
}
```

如果供应商没有明确允许，provider adapter 不能暴露 hidden chain-of-thought。可用时，reasoning 通常应该以 summary 或 encrypted 形式出现。

### 9.7 UsageEvent

```ts
interface UsageEvent {
  type: "usage";
  usage: Usage;
}

interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  toolTokens?: number;
  totalTokens?: number;
  costUsd?: number;
}
```

### 9.8 ProviderStateEvent

```ts
interface ProviderStateEvent {
  type: "provider_state";
  state: ProviderState;
}
```

### 9.9 ErrorEvent

```ts
interface ErrorEvent {
  type: "error";
  error: AgentError;
}
```

### 9.10 RunTerminatedEvent

`RunTerminatedEvent` 是 provider stream 事件，表示供应商侧本次 step/run 已经进入终止状态。它与 `ErrorEvent` 不同：有些终止是正常完成或用户取消，不应被建模为错误。

```ts
interface RunTerminatedEvent {
  type: "run_terminated";
  runId: string;
  sessionId: string;
  reason: TerminalReason;
  error?: AgentError;
}

type TerminalReason =
  | "completed"
  | "max_turns"
  | "user_aborted"
  | "tool_denied"
  | "tool_error"
  | "model_error"
  | "context_blocked"
  | "compaction_failed"
  | "permission_blocked"
  | "internal_error";
```

`terminated` 不是 run/session status。它只用于 provider event 语义：`RunTerminatedEvent` 表示 provider stream 已到达终点，并通过 `reason` 说明原因。Runtime adapter 不得把它原样转成 `run.terminated` runtime event；必须映射成 runtime 层的 `run.completed`、`run.failed` 或 `run.cancelled`。

## 10. Provider State

Provider state 对 agent core 不透明。

```ts
interface ProviderState {
  provider: string;
  opaque: unknown;
  expiresAt?: string;
}
```

示例：

```ts
{
  provider: "openai",
  opaque: {
    previousResponseId: "resp_123"
  }
}
```

```ts
{
  provider: "anthropic",
  opaque: {
    cacheControlBlocks: ["system", "repo-guide"]
  }
}
```

Provider state 应该被视为优化，而不是唯一源真相。即使 provider state 缺失或过期，runtime 也应该能 replay transcript items。

## 11. Tool Specification

```ts
interface ToolSpec {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  policy: ToolPolicy;
  execution?: ToolExecutionMetadata;
  metadata?: Record<string, unknown>;
}
```

Tool name 在一个 session 内应该稳定且全局唯一。

推荐命名：

```text
file.read
file.write
shell.run
browser.navigate
browser.screenshot
git.diff
github.create_pull_request
```

`ToolExecutionMetadata` 描述 runtime 执行工具时需要的行为属性。它不是给模型自由解释的提示，而是 ToolRuntime、UI、并发调度、artifact store 和 audit log 的共同契约。

```ts
interface ToolExecutionMetadata {
  readOnly: boolean;
  destructive: boolean;
  concurrency: "parallel_safe" | "exclusive";
  progressSchema?: JsonSchema;
  inlineOutputLimitBytes?: number;
  artifactStrategy?: "never" | "on_large_output" | "always";
  resultOrdering?: "call_order" | "completion_order";
}
```

默认值必须保守：缺少 `readOnly` 时按 `false` 处理，缺少 `destructive` 时按 `true` 处理，缺少 `concurrency` 时按 `exclusive` 处理。模型可见的 tool description 不能覆盖这些执行属性。

### 11.1 ToolPolicy

```ts
interface ToolPolicy {
  risk: "low" | "medium" | "high" | "critical";
  approval: "never" | "on_risk" | "always";
  permissions: ToolPermissions;
  sandbox?: SandboxPolicy;
}
```

### 11.2 ToolPermissions

```ts
interface ToolPermissions {
  filesystem?: "none" | "read" | "write";
  network?: boolean;
  shell?: boolean;
  browser?: boolean;
  secrets?: "none" | "read";
}
```

### 11.3 SandboxPolicy

```ts
interface SandboxPolicy {
  cwd?: string;
  writableRoots?: string[];
  network?: "disabled" | "enabled" | "allowlist";
  allowlistHosts?: string[];
  maxDurationMs?: number;
}
```

## 12. Tool Runtime

```ts
interface ToolRuntime {
  execute(call: ToolCallItem, context: ToolExecutionContext): Promise<ToolResultItem>;
}
```

```ts
interface ToolExecutionContext {
  sessionId: string;
  policy: RuntimePolicy;
  availableTools: ToolSpec[];
  approval?: ApprovalController;
  metadata?: Record<string, unknown>;
}
```

```ts
interface RuntimePolicy {
  filesystem?: {
    readRoots?: string[];
    writableRoots?: string[];
    deniedPaths?: string[];
  };
  network?: {
    mode: "disabled" | "enabled" | "allowlist";
    allowlistHosts?: string[];
  };
  shell?: {
    enabled: boolean;
    allowedPrefixes?: string[][];
    deniedCommands?: string[];
  };
  approvals?: {
    defaultMode: "never" | "on_risk" | "always";
    riskThreshold?: "medium" | "high" | "critical";
  };
  secrets?: {
    mode: "none" | "refs_only" | "read";
  };
}
```

这是协议层最低要求。具体 runtime 可以定义更丰富的 policy model，只要它能被降解成可强制执行的工具执行约束。

Tool runtime 负责：

- 根据 `inputSchema` 校验 tool input。
- 检查 tool policy。
- 在需要时请求 approval。
- 强制 filesystem、network、shell 和 sandbox 约束。
- 返回结构化输出。
- 对 secrets 做 redaction。
- 记录 audit logs。

Provider adapter 不能绕过 tool runtime。

## 13. Approval Model

Tools 可能需要在执行前审批。

```ts
interface ApprovalRequest {
  id: string;
  callId: string;
  toolName: string;
  reason: string;
  risk: "medium" | "high" | "critical";
  inputPreview: Content[];
}
```

`id` 是 runtime 分配的稳定 approval request ID，用于 SDK/UI 调用 `decideApproval(id, decision)`。`callId` 只关联被审批的 tool call，不能替代 approval request ID。

```ts
interface ApprovalDecision {
  status: "approved" | "denied";
  decidedBy: "user" | "policy";
  reason?: string;
}
```

如果 approval 被拒绝，runtime 应追加一个 `status="denied"` 的 `ToolResultItem`，并把该结果反馈给模型。

## 14. Context Management

Context manager 为 provider call 准备 transcript items。

```ts
interface ContextManager {
  prepare(input: PrepareContextInput): Promise<PrepareContextResult>;
  compact(input: RuntimeCompactInput): Promise<SummaryItem>;
}
```

```ts
interface PrepareContextInput {
  items: AgentItem[];
  instructions: string;
  tools: ToolSpec[];
  budget: ContextBudget;
  capabilities: ProviderCapabilities;
}

interface PrepareContextResult {
  items: AgentItem[];
  instructions: string;
  tools: ToolSpec[];
  droppedItemIds?: string[];
  summaryItemIds?: string[];
  budget: ContextBudget;
  tokenEstimate?: number;
}
```

```ts
interface ContextBudget {
  modelWindowTokens: number;
  maxInputTokens: number;
  reservedOutputTokens: number;
  reservedToolTokens?: number;
  effectiveInputTokens: number;
  thresholds: {
    warningTokens: number;
    compactTokens: number;
    blockingTokens: number;
  };
  compactionFailures: number;
}
```

```ts
interface RuntimeCompactInput {
  items: AgentItem[];
  instructions?: string;
  budget: ContextBudget;
  capabilities: ProviderCapabilities;
  reason: "token_budget" | "checkpoint" | "resume" | "manual";
}
```

`effectiveInputTokens` 是实际可放入 provider call 的输入窗口，至少要扣除 `reservedOutputTokens` 和 `reservedToolTokens`。如果 token 估算超过 `warningTokens`，runtime 应记录诊断事件；超过 `compactTokens`，runtime 应尝试压缩或 artifact 化；超过 `blockingTokens` 且压缩不可用时，run 应以 `reason="context_blocked"` 终止。

准备策略：

```text
1. 保留 instructions 和高优先级 policy。
2. 保留当前用户任务。
3. 保留最近 items。
4. 保留未解决 tool calls 和 errors。
5. 保留 active plan 和 checkpoint summaries。
6. 压缩较旧的低优先级 transcript 区域。
7. 摘要化后丢弃冗余长输出。
```

## 15. Compaction

Compaction 可以由供应商原生能力执行，也可以由 runtime 管理。

原生 compaction：

```text
Agent Core -> Provider Adapter -> Provider compact endpoint
```

Runtime compaction：

```text
Agent Core -> ContextManager -> summarizer model or local summarizer
```

Compaction 输出必须表示为 `SummaryItem`。

```ts
interface CompactInput {
  items: AgentItem[];
  instructions?: string;
  targetTokens?: number;
}

interface CompactResult {
  summary: SummaryItem;
  providerState?: ProviderState;
}
```

Compaction summary 应保留：

- 用户目标。
- 当前计划。
- 已做出的决策。
- 已修改文件。
- 已运行命令。
- 测试结果。
- 已知失败。
- 未解决问题。
- 约束和权限。

Compaction summary 不应保留：

- 有短错误摘要即可说明问题的完整 terminal logs。
- 重复文件列表。
- 已过期失败尝试，除非它解释了当前状态。
- Secrets 或 credentials。

Compaction 必须有失败断路器。Runtime 应记录连续压缩失败次数；当失败次数超过 policy 阈值后，不再重复调用 summarizer 或 provider compact endpoint，而是以 `reason="compaction_failed"` 终止或降级为只读用户说明。断路器事件必须进入 event log，便于 replay 和诊断。

## 16. Capabilities

```ts
interface ProviderCapabilities {
  nativeToolCalling: boolean;
  parallelToolCalls: boolean;
  streaming: boolean;
  imageInput: boolean;
  fileInput: boolean;
  jsonMode: boolean;
  providerState: boolean;
  promptCaching: boolean;
  compaction: "native" | "runtime" | "none";
  reasoning: "none" | "hidden" | "summary" | "encrypted";
  maxInputTokens: number;
  maxOutputTokens: number;
  supportedContentTypes: ContentTypeName[];
}
```

```ts
type ContentTypeName =
  | "text"
  | "json"
  | "image"
  | "file_ref"
  | "diff"
  | "terminal"
  | "binary_ref";
```

Agent 行为应该由 capability 驱动。

示例：

- 如果 `nativeToolCalling=true`，使用供应商原生 tool calling。
- 如果 `nativeToolCalling=false`，使用 JSON tool-call shim。
- 如果 `imageInput=false`，把 screenshots 转成文本 observations 或使用 OCR。
- 如果 `providerState=false`，replay transcript items。
- 如果 `promptCaching=false`，忽略 cache hints。
- 如果 `compaction="none"`，在可用时使用 runtime summarization。

## 17. Provider Adapter 职责

Provider adapter 必须：

- 把 `RunStepInput` 转换成供应商原生 request 格式。
- 把供应商 streaming events 转换成 `RunEvent`。
- 把供应商原生 tool calls 转换成 `ToolCallItem`。
- 把供应商原生 state 转换成 `ProviderState`。
- 强制供应商 content restrictions。
- 把 provider errors 表示为 `AgentError`。
- 准确报告 capabilities。

Provider adapter 不能：

- 执行工具。
- 做 approval 决策。
- 修改文件。
- 把 provider errors 隐藏成 assistant text。
- 泄漏 hidden reasoning。
- 编造不支持的 capabilities。

## 18. Tool-Call Fallback Mode

有些供应商或本地模型不支持 native tool calling。ARP 通过结构化 JSON 输出支持 fallback tool calling。

Fallback instruction：

```text
When you need to call a tool, output only JSON matching:
{
  "type": "tool_call",
  "name": string,
  "input": object
}

When finished, output:
{
  "type": "final",
  "content": string
}
```

Adapter 解析模型输出，并发出 `tool_call_done` 或 `message_done`。

Fallback mode 不如 native tool calling 可靠。Adapter 应通过 capability metadata 暴露这一点。

## 19. Error Model

```ts
interface AgentError {
  code: string;
  message: string;
  category:
    | "provider"
    | "tool"
    | "validation"
    | "permission"
    | "rate_limit"
    | "timeout"
    | "context"
    | "internal";
  retryable: boolean;
  details?: unknown;
}
```

示例：

```text
provider.rate_limit
provider.invalid_request
tool.validation_failed
tool.permission_denied
context.token_budget_exceeded
runtime.cancelled
```

Runtime 应区分模型可见错误和内部错误。

Tool errors 通常对模型可见，因为模型可以恢复。

Provider authentication errors 通常不对模型可见，因为模型无法修复。

`TerminalReason` 是 run 级终止原因，不等同于 error category。正常完成、用户取消、权限阻断、上下文阻断和内部错误都应有不同 reason，便于 UI、replay、metrics 和 resume 决策。

## 20. Session Model

`RunStatus` 和 `RuntimeSessionStatus` 是 runtime/store/protocol 的唯一状态枚举源真相。

```ts
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
```

Run terminal statuses are `completed`、`failed`、`cancelled`。Session terminal statuses are also `completed`、`failed`、`cancelled`。`terminalReason` explains why the terminal status was reached; it is not a status.

`RuntimeSessionStatus` 只表达 session 生命周期和是否正在执行。`waiting_for_tool`、`waiting_for_approval`、`cancelling` 只属于 `RunStatus`，不得写入 `sessions.status`，也不得通过 `session.status_changed` 发送。UI 需要展示这些中间态时，必须读取 active run 或消费 `run.status_changed` runtime event 派生。

```ts
interface AgentSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: RuntimeSessionStatus;
  terminalReason?: TerminalReason;
  items: AgentItem[];
  providerState?: ProviderState;
  checkpoints: CheckpointItem[];
  usage?: Usage;
  metadata?: Record<string, unknown>;
}
```

Transcript 是源真相。Provider state 是优化。

## 21. Persistence

实现应该持久化：

- Session metadata。
- Agent items。
- Run events。
- Run terminal reason。
- Tool results。
- Approval decisions。
- Provider state。
- Checkpoints。
- Usage。

推荐持久化形态可以是 SQLite 或 append-only 文件日志。当前 Electrolyte Phase 0 使用 SQLite；导出、fixtures 和轻量实现可以使用 JSONL：

```text
SQLite:
  sessions
  runs
  items
  provider_events
  runtime_events
  approvals
  artifacts

JSONL export:
  sessions/{sessionId}/session.json
  sessions/{sessionId}/items.jsonl
  sessions/{sessionId}/events.jsonl
  sessions/{sessionId}/artifacts/
```

Event logs 应尽可能 append-only。

## 22. Security

ARP 把模型决策和 runtime authority 分离。

模型可以请求 tool call，但只有 runtime 能授权并执行它。

安全要求：

- 执行前校验 tool input。
- 强制 sandbox boundaries。
- 风险操作必须 approval。
- 从 model-visible content 中 redaction secrets。
- 避免向 provider 发送不必要文件。
- 记录 tool calls 和 approval decisions。
- 把 provider output 当作不可信输入处理。

高风险 tools 包括：

- Shell 执行。
- 递归文件删除。
- 对任意 host 的网络请求。
- Credential 访问。
- Git push、release、deploy 或 production database operations。

## 23. Prompt Caching 策略

ARP 把 prompt caching 建模为 hints，而不是保证可用的功能。

推荐输入顺序：

```text
1. Stable instructions.
2. Stable project guide.
3. Stable tool definitions.
4. Session summaries and checkpoints.
5. Recent transcript items.
6. Latest user message and tool results.
```

这个布局能提升支持 prefix caching 的供应商的 cache reuse。

如果供应商不支持 caching，同样顺序仍能改善可读性和上下文管理。

## 24. Provider 映射示例

### 24.1 OpenAI-Compatible Chat Completions Adapter

Phase 0 的真实 provider 优先实现 OpenAI-compatible Chat Completions adapter，目标 endpoint 是 `/v1/chat/completions`。它用于覆盖 OpenAI-compatible 服务，而不是把 ARP 降级成 chat API。

可能映射：

```text
RunStepInput.instructions -> system/developer message
AgentItem[] -> messages
ToolSpec[] -> tools where supported
ToolCallItem -> assistant message tool_calls
ToolResultItem -> tool message
RunEvent -> streaming chat completion chunks or synthesized events
```

兼容规则：

- 如果 endpoint 支持 OpenAI-style `tools` / `tool_calls`，adapter 使用 native tool calling。
- 如果 endpoint 不支持 tool calling，但支持 JSON output，adapter 使用 JSON fallback tool-call mode。
- 如果 endpoint 不支持 streaming，adapter 可以合成 `message_done`，但 capabilities 必须如实声明 `streaming=false`。
- provider state 通常不可用；adapter 必须支持 transcript replay。
- 不同 OpenAI-compatible endpoint 的 tool calling、JSON mode、usage 字段和 error shape 不一致，adapter 不能假设全部可用。

### 24.2 OpenAI Responses Adapter

可能映射：

```text
RunStepInput.instructions -> Responses API instructions
RunStepInput.tools -> Responses API tools / function tools
AgentItem[] -> Responses API input items
ProviderState.previousResponseId -> previous_response_id
ToolCallItem -> function_call item
ToolResultItem -> function_call_output item
RunEvent -> response output events
```

适合映射的 OpenAI-specific features：

- Native tool calling。
- Streaming response events。
- Reasoning summaries 或 encrypted reasoning。
- 通过 response IDs 表示 provider state。
- Prompt caching。
- 可用时的 native compaction。

### 24.3 Anthropic Messages Adapter

可能映射：

```text
RunStepInput.instructions -> system
AgentItem[] -> messages
ToolSpec[] -> tools
ToolCallItem -> tool_use block
ToolResultItem -> tool_result block
Provider cache hints -> cache_control where supported
```

Anthropic-specific features 应留在 adapter 内。

### 24.4 Local Model Adapter

可能映射：

```text
RunStepInput.instructions + items + tools -> rendered prompt
Tool calls -> parsed JSON output
ProviderState -> none
Streaming -> token stream if supported
Compaction -> runtime summarization
```

Local adapters 应如实说明较弱的 tool-call reliability。

## 25. 兼容级别

ARP providers 可以声明 compatibility levels。

### Level 0：文本

支持 text input 和 text output。

### Level 1：结构化输出

支持 JSON mode 或可靠 structured output。

### Level 2：工具调用

支持 native 或 adapter-managed tool calling。

### Level 3：Streaming Agent Events

支持 streaming text 和 tool-call events。

### Level 4：有状态 Agent Runs

支持 provider state 或高效 continuation。

### Level 5：长任务 Agent 优化

支持 caching、compaction、reasoning summaries 或等价高级能力。

Agent application 可以为特定任务要求最低 compatibility level。

## 26. 版本治理

ARP 使用 semantic versioning。

```text
0.x: draft, breaking changes allowed
1.x: stable core protocol
```

兼容规则：

- Minor versions 可以增加 optional fields 和 event types。
- Patch versions 可以澄清行为。
- Major versions 可以改变 required fields 或语义。

除非 schema 明确要求，否则 unknown fields 必须被忽略。

Unknown event types 应尽可能被记录并跳过。

## 27. 最小 TypeScript 定义

```ts
export interface AgentProtocolProvider {
  id: string;
  capabilities(): Promise<ProviderCapabilities>;
  runStep(input: RunStepInput): AsyncIterable<RunEvent>;
  countTokens?(input: TokenCountInput): Promise<TokenCountResult>;
  compact?(input: CompactInput): Promise<CompactResult>;
}

export interface RunStepInput {
  model: string;
  instructions: string;
  items: AgentItem[];
  tools: ToolSpec[];
  state?: ProviderState;
  options?: RunOptions;
  metadata?: Record<string, unknown>;
}

export type AgentItem =
  | UserMessage
  | AssistantMessage
  | ToolCallItem
  | ToolResultItem
  | SystemObservation
  | SummaryItem
  | CheckpointItem;

export type RunEvent =
  | TextDeltaEvent
  | MessageDoneEvent
  | ToolCallStartedEvent
  | ToolCallDeltaEvent
  | ToolCallDoneEvent
  | ReasoningSummaryEvent
  | UsageEvent
  | ProviderStateEvent
  | ErrorEvent
  | RunTerminatedEvent;

export type TerminalReason =
  | "completed"
  | "max_turns"
  | "user_aborted"
  | "tool_denied"
  | "tool_error"
  | "model_error"
  | "context_blocked"
  | "compaction_failed"
  | "permission_blocked"
  | "internal_error";
```

## 28. 示例 Session

用户请求：

```text
Fix the failing test.
```

Transcript：

```json
[
  {
    "id": "item_1",
    "type": "user_message",
    "createdAt": "2026-05-07T10:00:00Z",
    "content": [{ "type": "text", "text": "Fix the failing test." }]
  },
  {
    "id": "item_2",
    "type": "tool_call",
    "createdAt": "2026-05-07T10:00:05Z",
    "callId": "call_1",
    "name": "shell.run",
    "input": { "command": "npm test" }
  },
  {
    "id": "item_3",
    "type": "tool_result",
    "createdAt": "2026-05-07T10:00:20Z",
    "callId": "call_1",
    "status": "ok",
    "content": [
      {
        "type": "terminal",
        "command": "npm test",
        "stdout": "1 test failed: expected 200 received 500",
        "exitCode": 1
      }
    ]
  },
  {
    "id": "item_4",
    "type": "assistant_message",
    "createdAt": "2026-05-07T10:03:00Z",
    "final": true,
    "content": [
      {
        "type": "text",
        "text": "Fixed the failing test by correcting the route handler and verified with npm test."
      }
    ]
  }
]
```

## 29. 实现计划

推荐第一版实现：

```text
1. 定义 TypeScript protocol types。
2. 使用 Kysely + Node.js `node:sqlite` 实现 SQLite session store，items/events 逻辑上 append-only。
3. 引入 Effect service/layer，建立 run scope、typed errors、timeout 和 cancellation 基线。
4. 实现包含 file.read、file.write、shell.run 的 ToolRuntime。
5. 实现 OpenAI-compatible Chat Completions adapter。
6. 实现用于 replay 和 CI tests 的 MockProvider。
7. 增加 recent-window strategy 的 context manager。
8. 为 risky tools 增加 approval policy。
9. 使用 Vitest 和 recorded sessions 增加 replay tests。
```

不要从构建所有 provider 开始。

先从一个 OpenAI-compatible provider adapter 和一个 mock adapter 开始。在 Phase 4 Provider Abstraction 阶段再加入 OpenAI Responses 和对比用 Anthropic adapter；那时 runtime 已经准备好验证真实 provider 差异，不会扩大 Phase 0 范围。

## 30. 设计原则

ARP 遵循以下原则：

- Transcript 是源真相。
- Provider state 是优化。
- Tool execution 属于 runtime。
- Provider 差异必须通过 capabilities 显式表达。
- 高级 provider features 应该被保留，而不是抹平。
- Model output 在校验前是不可信的。
- 长任务需要 checkpoints 和 compaction。
- 协议应该建模 agent execution，而不只是 conversation。

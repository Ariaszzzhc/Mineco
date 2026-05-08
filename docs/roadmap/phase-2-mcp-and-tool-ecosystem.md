# Phase 2 MCP and Tool Ecosystem

版本：0.2 详细规划

状态：详细规划

相关文档：

- [开发计划](development-plan.md)
- [Phase 1 可靠性与可审阅性](phase-1-reliability-and-reviewability.md)
- [Phase 3 Agent Skills](phase-3-agent-skills.md)
- [Phase 4 Provider Abstraction](phase-4-provider-abstraction.md)
- [AI Agent Runtime 设计](../architecture/agent-runtime-design.md)
- [Agent Runtime 协议](../protocol/agent-runtime-protocol.md)
- [开发工作流和规范](../process/development-workflow-and-standards.md)
- [MCP Specification 2025-11-25 资料记录](../research/mcp-specification-2025-11-25.md)
- [Claude Code Book 第 12 章分析](../research/claude-code-book/ch12.md)
- [Claude Code Book 整体分析](../research/claude-code-book/overall-analysis.md)

语言：中文

## 1. 阶段定位

Phase 2 不重写 Phase 0/1 的 AgentCore、ToolRuntime、session store、ContextManager 或 TUI。它在可靠执行、可审阅界面、approval、artifact 和 replay 基础上，把 MCP server 作为受控能力来源接入，并形成统一 ToolRegistry。

Phase 2 的目标不是“让 MCP server 拥有权限”，而是把 MCP 暴露的 tools、resources 和 prompts 映射成 Mineco runtime 可审计、可禁用、可过滤、可回放的能力来源。所有 MCP tool 调用仍必须走 ToolRuntime，所有模型可见能力仍必须经过 visibility、availability 和 permission merge。

Phase 2 的主轴：

1. MCP 配置来源和 trust model：区分 builtin、user、workspace local、workspace shared、cli override 和 policy。
2. MCP client manager：管理 server 启停、连接状态、discovery、timeout、重连和取消传播。
3. MCP tool discovery：把 MCP tool schema 映射为 `RuntimeToolSpec`，并提供稳定命名、冲突处理和 source tracking。
4. Unified ToolRegistry：把内置 tools 和 MCP tools 纳入同一个 registry、visibility、availability、permission merge 和 approval pipeline。
5. MCP resources 和 prompts：只作为受控 context/instruction 候选进入模型，默认低信任，不能覆盖 runtime policy。
6. 当前产品 interface 可审阅：TUI 能展示 MCP server、tools、resources、prompts、approval、tool output、artifact 和错误状态。
7. Replay 和审计：历史 run 必须保留当时的 tool snapshot、server source、approval 和 artifact 引用，不能依赖当前 MCP server 状态重解释。

Phase 2 结束后，内置 tools 和 MCP tools 都通过同一个 ToolRuntime 和 ToolRegistry 管理。Phase 3 的 Agent Skills、后续 connectors 和插件工具都应复用这一阶段形成的 ToolSource、permission merge、visibility、availability 和 source tracking 边界。

## 2. 前置条件

Phase 2 默认 Phase 1 已经交付：

- 最小 TUI shell 可启动，并通过 Runtime SDK 消费 RuntimeEvent。
- TUI 已有 Tools、Artifacts、Context、Approvals、Diff、Tests 和 Logs 视图或等价能力。
- ToolRuntime 已支持 tool execution metadata、approval metadata、read-only/write 风险属性、artifact strategy、timeout、redaction 和 audit log。
- Approval 已支持 approve once、deny、approve similar prefix，并保存 decision source、scope、risk、sandbox snapshot 和 matched rule。
- ContextManager 已支持 budget-driven selection、large output artifact、plan summary、checkpoint summary 和 context diagnostics。
- session store 可保存 sessions、runs、items、runtime_events、approvals、artifacts 和 Phase 1 扩展字段。
- Replay tests、resume tests、approval tests 和 artifact tests 已覆盖基本 run loop。
- Plan mode 已作为 read-only permission mode 引入，写入和外部副作用工具在 plan 阶段不可用。

如果实现时发现这些前置条件缺失，应补齐 Phase 1 边界，而不是让 MCP client、TUI 或 ToolRegistry 直接调用 provider、shell、filesystem、network 或 store。

## 3. 用户场景

Phase 2 必须覆盖这些端到端场景：

- 配置本地 MCP server：用户添加一个 stdio MCP server，TUI 显示配置来源、trust level、transport、状态和 validation 结果。
- 启用 workspace MCP：项目共享配置推荐一个 MCP server，但默认低信任；用户显式启用后才启动或暴露 tools。
- 查看 MCP tools：用户能看到每个 MCP tool 的 model-visible name、原始 server/tool 名称、description、input schema、risk、read-only/destructive metadata 和来源。
- 调用只读 MCP tool：agent 使用一个只读 MCP tool 获取外部上下文，tool call 走 ToolRuntime，结果进入 transcript，长输出进入 artifact。
- 审批高风险 MCP tool：MCP tool 声明或推断为写入、网络、shell、外部副作用或未知风险时，TUI 显示 approval prompt，用户可 approve 或 deny。
- 拒绝 MCP tool：用户 deny 后，runtime 追加 `status="denied"` 的 ToolResultItem，模型收到可恢复反馈，server 不应被调用。
- 禁用 MCP server：禁用后，该 server 的 tools 不再进入当前 run 的 model-visible tool list；历史 run 的 tool snapshot 仍可审阅。
- server 崩溃或断连：TUI 显示 failed/degraded 状态；运行中的 tool call 以结构化 tool error 返回，不让 AgentCore 或 TUI 崩溃。
- resource 进入 context：agent 或用户请求读取 MCP resource 时，runtime 先检查来源、URI、mime、size、secrets、trust 和 context budget，再决定 inline、summary 或 artifact。
- prompt 作为候选：MCP prompt 只能作为低优先级 instruction 候选显示和加载，不能覆盖 system/runtime/policy/skill instructions。
- 命名冲突：两个 server 暴露同名 tool，ToolRegistry 仍能生成稳定唯一 ID，并向用户展示冲突来源。
- Replay 历史 session：即使当前 MCP server 不存在或 schema 已变化，历史 session 仍能显示当时的 tool schema snapshot、approval、output artifact 和错误状态。

## 4. 用户能力

Phase 2 用户应能：

- 配置 MCP server，至少支持 user global、workspace local、workspace shared 和 cli/session override 来源。
- 查看 MCP server 列表：id、name、transport、source、trust、enabled、connection state、last error、tool/resource/prompt count。
- 启用、禁用、reload 或 disconnect MCP server；workspace shared server 默认需要显式启用。
- 查看 MCP tools：canonical tool id、model-visible name、origin server、schema、visibility、availability、risk、approval policy、read-only/destructive metadata。
- 查看 MCP resources 和 prompts 的 metadata；加载具体内容前能看到来源和风险提示。
- 对 MCP tool approval 做 approve once、deny 或 approve similar prefix。
- 在 Tools view 中按 source 过滤内置 tools、MCP tools 和后续 tool sources。
- 在 Context view 中看到 MCP resource/prompt 对 context budget 和 instruction stack 的影响。
- 在 Artifacts view 中打开 MCP tool output、large resource、discovery report 或 error log artifact。
- 查看 MCP server 启停、discovery、tool registration、resource load 和 tool execution 的 runtime events。
- 在 replay 或历史 session 中查看当时的 MCP server/tool snapshot，而不是按当前配置重算。

## 5. 必做范围

### 5.1 Product / Interface

Phase 2 的默认验收 interface 仍是 Phase 1 TUI。REPL 可以显示简化摘要，但不能破坏 Phase 0/1 能力。

TUI 必须新增或完善：

- `MCP` view：server list、connection state、source、trust、enabled、transport、last error、discovery timestamp。
- `Tools` view：按 source 展示 builtin tools、MCP tools 和 hidden/blocked availability reason；显示 visibility、availability、risk、approval policy 和 schema summary。
- `Context` view：显示已加载 MCP resources、prompts、source、token estimate、filter decision 和 artifact refs。
- `Approvals` view：MCP tool approval prompt 显示 tool name、origin server、risk、reason、input preview、cwd、sandbox 状态和 matched policy。
- `Artifacts` view：支持 MCP tool output、large resource、discovery report 和 connection error log。
- Command palette 或等价入口：enable server、disable server、reload server、refresh discovery、inspect tool schema。
- RuntimeEvent 渲染：例如 `mcp.server.connected`、`mcp.discovery.completed`、`mcp.tool.hidden`、`mcp.resource.loaded`。

TUI 不得：

- 直接启动或杀死 MCP server 进程。
- 直接调用 MCP client SDK。
- 直接把 MCP tool 暴露给模型。
- 直接读取 MCP resource 内容。
- 自己决定 permission merge、approval 或 resource filter。
- 修改 transcript 或历史 tool snapshot。

所有动作都必须通过 Runtime SDK、McpClientManager、ToolRegistry、ContextManager 和 ToolRuntime 边界。

### 5.2 MCP 配置来源和 Trust Model

MCP server 配置必须按来源建模，不能把所有 JSON 合并成同一信任级别。

建议来源：

```text
builtin            runtime 内置或随产品发布的安全默认 server 定义
user_global        用户配置目录，用户显式添加
workspace_local    本机工作区配置，不提交，适合个人 server 和 secret refs
workspace_shared   项目共享配置，默认低信任，只能推荐或声明
cli_override       当前启动命令或 session 覆盖
policy             本机或组织策略，优先级最高
```

配置至少需要表达：

- `id`：用户可见且在 workspace/session 内稳定。
- `transport`：Phase 2 gate 至少要求 `stdio`。
- `command`、`args`、`cwd`：stdio server 启动信息。
- `url`：为 HTTP/SSE 预留。
- `env`：只允许 literal safe value 或 `SecretRef`，不能把 secret 值写入 session store 或 event log。
- `enabled` / `autoStart`：是否允许 runtime 启动。
- `trustLevel`：`builtin`、`user`、`workspace`、`third_party` 或等价分级。
- `permissions`：server 请求的能力边界，只能被 policy/user 信任来源批准，不能由低信任来源扩大。
- `displayName`、`description`：只用于 UI，不能影响 policy。

合并规则：

- `policy` 可以 deny server、锁定 server、禁用 transport、限制 command/path/network、禁止 workspace shared server。
- `workspace_shared` 只能推荐 MCP server，默认不能自动启用外部进程、网络 endpoint 或危险权限。
- `workspace_local` 和 `user_global` 可以表达用户偏好，但仍受 policy 限制。
- `cli_override` 只影响当前 session/run，不能绕过 policy deny。
- Deny 优先于 enable；低信任来源不能覆盖高信任 deny。
- 每个启用 server 都必须保留 config source 和 trust snapshot。

### 5.3 MCP Client Manager 和 Connection Lifecycle

Phase 2 引入 `McpClientManager` runtime service，负责 server lifecycle、connection state、capability discovery 和 cleanup。

Connection state 至少需要覆盖：

```text
configured
disabled
starting
connected
degraded
failed
stopping
disconnected
```

行为要求：

- server lifecycle 挂在 Effect scope 或等价结构化并发 scope 下，session/run cancel、runtime shutdown 和 server disable 都能 cleanup。
- stdio server 启动必须有 timeout、stderr/stdout capture、env redaction、cwd boundary 和 process cleanup。
- server 启动失败不应阻塞整个 runtime；对应 tools/resources/prompts 标记为 unavailable。
- discovery 失败可以让 server 进入 `degraded`，但不能暴露未校验 tools。
- runtime 应支持手动 refresh discovery；自动重试必须有 backoff 和上限。
- 对同一 server 的并发 tool call 必须遵守 tool metadata 和 server concurrency 限制。
- server connection 不得直接持有 transcript 全量内容；只有 tool input/resource request 中明确传递的内容可以发给 server。
- connection state 变化必须产生 RuntimeEvent，并可被 replay。

Phase 2 gate 只要求 stdio transport 稳定。HTTP/SSE 可以在 P2 内作为后续切片或 feature flag，但不能阻塞 Phase 2 gate；WebSocket、远程 registry 和 hosted connector lifecycle 不属于本阶段。

### 5.4 Tool Discovery、Schema 映射和命名

MCP tool discovery 需要把 server 暴露的 tool schema 映射成 Mineco `RuntimeToolSpec`。

映射要求：

- MCP tool input schema 必须转换为 runtime 支持的 JSON Schema subset。
- schema 无法安全映射时，tool availability 必须为 `hidden` 或 `blocked`，并显示 validation error。
- tool description 是模型提示，不是权限或执行元数据来源。
- 如果 MCP server 提供 read-only、destructive、network、filesystem、idempotency 或 annotation hints，可以作为 policy input；缺失时使用保守默认。
- 缺少执行元数据时，默认 `readOnly=false`、`destructive=true`、`concurrency=exclusive`、approval 至少按风险触发。
- output schema 可选；缺失时按 unknown structured result 处理，并走 redaction/truncation/artifact policy。

命名规则：

- ToolRegistry 内部 canonical id 推荐使用 `mcp:<server-id>:<tool-name>` 或等价不可直接给模型调用的稳定 ID。
- model-visible name 推荐使用 `mcp.<serverId>.<toolName>` 的 sanitized 形式，避免与 `file.read`、`git.diff` 等内置 tool 冲突。
- 原始 MCP server id 和 tool name 必须保留在 `origin` metadata 中。
- 同一 session 内 tool name 必须稳定且唯一。
- sanitized name 冲突时，不应静默覆盖；runtime 应 hidden 冲突 tool、要求用户显式 alias，或生成带稳定 hash 的 alias，并在 UI 显示冲突原因。
- 用户 alias 不能伪装成内置 tool namespace，不能绕过 policy。

Discovery 策略：

- 启用 server 后可以 eagerly discovery tools/resources/prompts 的 metadata。
- 对大 schema 或频繁变化 server，可以 lazy refresh，但进入 model-visible tools 前必须有 schema snapshot。
- 每个 run 要保存 visible tool snapshot，包括 schema hash、origin、policy、execution metadata、visibility 和 availability。
- server schema 变化不能 retroactively 改变历史 run。

### 5.5 Unified ToolRegistry、Visibility、Availability 和 Permission Merge

Phase 2 必须把内置 tools 和 MCP tools 纳入同一个 ToolRegistry。

ToolRegistry 负责：

- 收集 BuiltInToolSource、McpToolSource 和后续 tool source。
- 校验 `RuntimeToolSpec`。
- 生成当前 session/run 的 visible tool list。
- 保存 source metadata、schema hash、visibility、availability、policy 和 execution metadata。
- 支持按 source enable/disable。
- 支持 hidden/blocked/unavailable tool availability 状态。
- 为 ContextManager 和 Provider Adapter 提供 provider-neutral tool specs。

Visibility 至少支持：

- `model_visible`：模型可以主动调用。
- `runtime_only`：runtime 内部可用，模型不可见。
- `user_only`：只由 UI 或用户操作触发，模型不可见。

Availability 至少支持：

- `available`：可按 visibility 暴露和调用。
- `hidden`：不进入模型可见 tool snapshot，通常因为冲突、低信任、Plan mode 过滤或用户关闭。
- `blocked`：被 policy、schema validation、trust、sandbox 或 risk rule 明确阻止。
- `unavailable`：来源暂不可用，例如 MCP server disconnected 或本地依赖缺失。

`hidden`、`blocked`、`unavailable` 是 availability/status，不是 visibility 枚举。

Permission merge 规则：

- Tool source 只能声明能力需求，不能自己授予权限。
- policy deny 优先于用户配置，用户配置优先于 workspace shared。
- workspace shared server 默认低信任，不能扩大 filesystem、network、shell、secrets 或 destructive 权限。
- read-only Plan mode 只能看到已知 read-only 且无外部副作用的 MCP tools；未知风险 MCP tools 在 Plan mode 下不可见或必须 blocked。
- tool description、MCP prompt、resource 内容和 workspace config 都不能覆盖 runtime safety instruction、approval policy 或 sandbox state。
- MCP tool 的 approval scope 不能比其 origin server、transport、command/url、risk 和 sandbox snapshot 更宽。
- 禁用 server 后，其 tools 不能进入新 run 的 visible tool list；历史 run snapshot 保留。

### 5.6 MCP Tool Execution

MCP tool execution 必须作为 ToolRuntime wrapper 执行，而不是让 AgentCore 或 provider adapter 直接调用 MCP client。

固定路径：

```text
model emits tool call
  -> ToolRuntime lookup RuntimeToolSpec
  -> validate input schema
  -> normalize/canonicalize input where applicable
  -> evaluate policy, trust, sandbox, visibility, availability, approval
  -> request approval if needed
  -> call McpClientManager
  -> receive MCP result or error
  -> redact/truncate/artifact output
  -> append ToolResultItem
  -> emit runtime events and audit logs
```

执行要求：

- approval 被拒绝时，server 不应收到 tool call。
- server unavailable、timeout、schema mismatch、transport failure、tool error 都返回结构化 ToolResultItem，不应让 run loop 崩溃。
- Long output 必须 artifact 化或摘要化，不能直接塞满 transcript 或 model context。
- secrets 和 env 值必须 redacted；secret refs 可显示 ref id 或来源，不显示明文。
- stdout/stderr、transport logs 和 server error details 默认进入 artifact 或 redacted summary。
- tool timeout、run cancel 和 server disable 必须中断 pending call 或返回可解释 terminal/error result。
- MCP server 的真实外部副作用无法完全由 runtime 证明时，必须按更高风险处理。
- stdio server 进程能否 sandbox 取决于平台；无法提供强隔离时，TUI 和 approval prompt 必须显示 degraded sandbox 或 equivalent risk。

### 5.7 MCP Resources 和 Prompts

MCP server 可以提供 resources 和 prompts，但它们不是默认可信 context。

Resource discovery：

- discovery 阶段只读取 URI、name、description、mime、size、origin、hash/etag 或等价 metadata。
- 具体 resource 内容只有在用户、agent 或 skill 明确需要时才加载。
- resource URI scheme、host、path、mime、size、trust 和 source 必须经过 filter。
- binary resource 默认不 inline 到模型，作为 artifact metadata 或 file ref 展示。
- text resource 有 inline size limit；超过 limit 写 artifact 或生成 summary/ref。
- resource 内容进入模型前必须经过 ContextManager budget selection。
- workspace shared MCP resource 默认低信任，不能读取 secrets 或 workspace 外路径，除非通过普通 ToolRuntime policy 明确允许。

Prompt handling：

- MCP prompt 只能作为低优先级 instruction 候选或用户可选模板。
- MCP prompt 不得覆盖 system、runtime safety、policy、Plan mode、approval、ToolRuntime metadata 或 skill priority。
- prompt 参数 schema 必须校验；prompt 渲染也要有 source tracking。
- workspace shared prompt 默认不自动注入，除非用户或可信 policy 显式启用。
- 已加载 prompt 必须在 Context view 显示 source、priority、token estimate 和 activation reason。

### 5.8 Security / Policy

Phase 2 必须保持这些安全规则：

- MCP server 是 tool/resource/prompt 来源，不是权限来源。
- MCP tool schema、description、prompt 和 resource 内容都不能提升权限。
- MCP tool 必须映射成 `RuntimeToolSpec` 并通过 ToolRuntime 执行。
- Workspace MCP 默认低信任，需要用户显式启用。
- 低信任配置不能自动启动本地进程、启用远程 endpoint、读取 secrets、打开网络或扩大 writable roots。
- command、cwd、resource path 和 file-like URI 必须 canonicalize。
- symlink 必须按 resolved path 检查边界。
- env 只能使用 safe literal 或 SecretRef；secret 明文不得写入 store、event log、tool result 或 artifact summary。
- remote MCP endpoint 若实现，默认按 external network 风险处理，并受 network allowlist 和 approval policy 控制。
- MCP output 可能包含 prompt injection，进入模型前必须保留 source label，并低于 runtime safety/policy。
- server stderr、logs、errors 需要 redaction，避免泄漏 token、env、path 或 secrets。
- 所有 enabled server、tool snapshot、resource load、prompt load、approval 和 denied call 都必须有 source tracking。

### 5.9 Runtime Events 和 Observability

Phase 2 允许增加 RuntimeEvent，但必须保持 Phase 0/1 consumer 能渲染未知事件摘要，并继续使用 dot event name。

建议事件：

- `mcp.server.configured`
- `mcp.server.enabled`
- `mcp.server.disabled`
- `mcp.server.starting`
- `mcp.server.connected`
- `mcp.server.degraded`
- `mcp.server.failed`
- `mcp.server.disconnected`
- `mcp.discovery.started`
- `mcp.discovery.completed`
- `mcp.tool.registered`
- `mcp.tool.hidden`
- `mcp.tool.blocked`
- `mcp.resource.listed`
- `mcp.resource.loaded`
- `mcp.resource.skipped`
- `mcp.prompt.available`
- `mcp.prompt.loaded`

事件至少应包含：

- session/run id 或 registry operation id。
- server id、source kind、trust level、transport。
- tool/resource/prompt id、name、origin 和 schema/hash。
- connection state、error kind、retry count 或 blocked reason。
- policy decision、visibility/availability decision 或 filter decision。

MCP tool call 自身仍使用普通 tool call / tool result events，并通过 origin metadata 标明它来自 MCP。

### 5.10 MCP spec 和 SDK 实现决策

外部规范原文链接和资料摘要见 [MCP Specification 2025-11-25 资料记录](../research/mcp-specification-2025-11-25.md)。Phase 2 只记录 Mineco 的实现决策：

- 目标协议版本固定为 `protocolVersion="2025-11-25"`，后续 MCP spec 升级必须作为显式兼容性工作处理。
- 官方 TypeScript SDK 值得使用，但只作为 MCP protocol/transport/client dependency，不能成为 Mineco 的权限或审计边界。
- Phase 2 gate 只要求使用官方 TypeScript SDK 实现 MCP protocol client、stdio transport、initialize、list tools/resources/prompts、call tool、read resource、get prompt 和 protocol-level error handling。
- Streamable HTTP transport 和 legacy SSE fallback 只保留 adapter 接口和 feature flag 位置；除非单独提升为 Phase 2 后续切片，否则不进入 Phase 2 gate、验收和必跑测试。
- 应把 SDK 包在 `McpClientManager` adapter 后面；AgentCore、TUI、Provider Adapter 和 ToolRuntime 不直接依赖 SDK 类型或 client instance。
- 不使用 SDK 承担 Mineco 的 ToolRegistry、permission merge、approval、sandbox、artifact、resource filter、prompt priority、secret redaction、run tool snapshot 或 replay 边界。
- MCP tool annotations、description、instructions 和 prompts 都只能作为不可信输入；是否 read-only、是否 model-visible、是否需要 approval 仍由 Mineco policy 决定。
- 实现 P2 时必须重新确认官方 TypeScript SDK stable release。若 v2 已稳定，优先评估 split packages `@modelcontextprotocol/client` / `@modelcontextprotocol/server`；否则固定 v1.x `@modelcontextprotocol/sdk`。
- 需要在 dependency policy 中 pin SDK major/minor，并用 fixture MCP servers 和 replay tests 覆盖 SDK 升级风险。

## 6. 数据模型变化

Phase 2 的 schema change 必须通过 migration 完成，并保持 Phase 0/1 session 可读。

建议新增或扩展：

- `tool_sources`：source id、kind、config source、trust level、enabled、priority、created_at、updated_at。
- `mcp_servers`：server id、source id、display name、transport、command/url ref、cwd、env secret refs、trust level、enabled、auto_start、status、last_error、schema/discovery hash。
- `mcp_connections` 或等价 connection log：server id、state、started_at、ended_at、error kind、retry count、capability snapshot。
- `tools` 或 `tool_specs`：canonical id、model-visible name、namespace、origin source、schema hash、description hash、visibility、availability、availability reason、policy、execution metadata、validation errors。
- `run_tool_snapshots`：run id、tool canonical id、schema hash、policy snapshot、visibility、availability、origin snapshot、model-visible name。
- `mcp_resources`：server id、resource id/uri、name、description hash、mime、size、origin hash、status、filter metadata。
- `mcp_prompts`：server id、prompt id/name、description hash、argument schema hash、status、trust/source metadata。
- `mcp_loaded_context`：run id、server id、kind resource/prompt、resource uri or prompt name、artifact ref、summary hash、token estimate、filter decision。
- `runtime_events`：支持 P2 MCP events，保持 append-only。
- `approvals`：origin source metadata、server id、tool canonical id、transport、sandbox snapshot。
- `artifacts`：支持 `mcp_discovery`、`mcp_tool_output`、`mcp_server_log`、`mcp_resource`、`mcp_prompt` artifact kind，并遵守架构文档中的 `ArtifactKind` union。

约束：

- `items` 仍是 transcript source of truth。
- MCP server 当前磁盘配置和当前 discovery cache 不能成为 replay 历史 run 的唯一依据。
- run 的 visible tool snapshot 必须可审阅。
- schema cache 可以重建，但历史 tool snapshot、approval 和 artifact refs 不能丢。
- secret 明文不得进入数据库。
- UI state 不进入 session store。
- migration 要有 tests，不能依赖手工修库。

## 7. 实现切片

Phase 2 按可验收的纵向切片推进。

### P2.1 ToolRegistry foundation

- 实现统一 ToolRegistry service。
- 将 Phase 0/1 built-in tools 注册为 BuiltInToolSource。
- 补 RuntimeToolSpec validation、source metadata、visibility、availability、schema hash 和 execution metadata。
- 为每个 run 固化 visible tool snapshot。

验收：内置 tools 通过 ToolRegistry 暴露给 provider；历史 run 可查看当时的 tool snapshot。

### P2.2 MCP 配置和 trust model

- 实现 MCP server config loader。
- 支持 user global、workspace local、workspace shared、cli/session override 和 policy merge。
- 实现 source trust、deny precedence、enabled/disabled 状态。
- env 只保存 safe literal 或 SecretRef。

验收：workspace shared server 默认不自动启用；policy deny 能阻止 server 暴露；TUI 显示 config source 和 trust。

### P2.3 stdio MCP client manager

- 实现 `McpClientManager`。
- 通过官方 TypeScript SDK client/stdio transport 接入协议层，外部只暴露 Mineco adapter。
- 支持 stdio server 启动、停止、timeout、stderr capture、env redaction、process cleanup。
- 实现 connection state machine 和 runtime events。
- server failed/degraded 不影响整个 runtime。

验收：本地 fixture MCP server 能启动、连接、断开；启动失败显示结构化错误。

### P2.4 Discovery、schema 映射和命名

- 实现 tools/resources/prompts metadata discovery。
- 将官方 SDK 返回的 MCP tool schema 和 2025-11-25 schema snapshot 映射为 RuntimeToolSpec。
- 实现 canonical id、model-visible name、sanitization、冲突处理和 hidden/blocked availability 状态。
- 保存 schema hash 和 discovery snapshot。

验收：一个 server 暴露的 tools 能显示在 Tools view；命名冲突不覆盖内置 tool；无法映射 schema 的 tool 被 blocked。

### P2.5 Visibility、availability、permission merge 和 Plan mode 集成

- 实现 ToolRegistry visibility + availability resolver。
- 实现 source trust、policy、user config、workspace config 的 permission merge。
- 实现 unknown-risk conservative defaults。
- 将 MCP tools 接入 read-only Plan mode 过滤。

验收：低信任或未知风险 tool 默认需要 approval 或不可见；Plan mode 下只有已知只读 MCP tools 可见。

### P2.6 MCP tool execution through ToolRuntime

- 将 MCP tool call 包装为 ToolRuntime 执行路径。
- 实现 input validation、approval、timeout、cancel、server unavailable、tool error 和 denied result。
- 实现 output redaction、inline limit 和 artifact strategy。
- 把 origin metadata 写入 tool result、approval 和 artifacts。

验收：agent 能调用 fixture MCP tool；高风险 tool 触发 approval；deny 后 server 未收到调用；长输出写 artifact。

### P2.7 Resources、prompts 和 context filter

- 实现 resource metadata discovery。
- 实现按需 resource load、URI/mime/size/trust/secrets filter。
- 实现 large resource artifact 或 summary/ref。
- 实现 prompt metadata、参数校验、低优先级 InstructionBlock 和 Context view 展示。

验收：resource 只有被请求时才加载；不安全 URI 或过大内容被 blocked/artifact；MCP prompt 不能覆盖 runtime policy。

### P2.8 Product MCP / Tools views

- 增加 TUI `MCP` view。
- 完善 `Tools` view 的 source filtering、tool schema inspect、hidden/blocked reason。
- 完善 `Context` view 的 MCP resource/prompt 展示。
- 完善 approval prompt 的 MCP origin 和 trust 显示。
- REPL 显示简化 MCP server/tool summary。

验收：用户能在 TUI 中启用、禁用、refresh、inspect MCP server 和 tools；TUI 操作都对应 Runtime SDK 调用。

### P2.9 Phase gate

- 补齐 unit、integration、replay tests。
- 完成 manual acceptance。
- 同步路线图、审计和已知限制。
- 确认 ToolRegistry 边界可被 Phase 3 Agent Skills 复用。

验收：Phase 2 gate checklist 全部通过。

## 8. 测试计划

自动测试使用 Vitest。Phase 2 必须增加以下测试层：

Unit tests：

- 官方 SDK adapter contract：SDK errors、protocol errors、connection closed、pagination、progress、cancellation 到 Mineco error/event 的映射。
- ToolRegistry source registration、schema hash、visible tool snapshot。
- MCP config merge：policy deny、workspace shared low trust、user enable、cli override。
- server id 和 tool name sanitization、duplicate conflict、alias restrictions。
- MCP tool schema mapping：valid schema、unsupported schema、missing schema、large schema。
- conservative execution metadata defaults：missing readOnly/destructive/concurrency。
- visibility resolver：model_visible、runtime_only、user_only。
- availability resolver：available、hidden、blocked、unavailable。
- permission merge：deny precedence、unknown risk、workspace shared cannot expand permissions。
- Plan mode filtering for MCP tools。
- connection state machine：starting、connected、degraded、failed、disabled、disconnected。
- stdio env redaction、cwd canonicalization、timeout 和 cleanup。
- resource filter：URI scheme、mime、size、secret-like content、trust level。
- prompt loading：argument schema validation、priority、source tracking。
- artifact strategy for `mcp_tool_output`、`mcp_server_log` 和 `mcp_resource`。

Integration tests：

- 使用官方 TypeScript SDK 启动 fixture stdio server，并通过 `McpClientManager` 完成 initialize/discovery/call。
- SDK create session -> enable fixture MCP server -> discovery -> visible tool snapshot。
- Fixture stdio MCP server exposes read-only tool; agent calls tool through ToolRuntime。
- High-risk MCP tool triggers approval; approve executes; deny returns denied ToolResultItem without server call。
- Disabled server removes tools from new run visible tool list。
- Server crash during discovery produces degraded/failed state without runtime crash。
- Server timeout during tool call returns structured tool error and writes runtime event。
- Large MCP tool output writes artifact and only summary/ref enters transcript。
- Resource load passes filter and records `mcp.resource.loaded` event。
- Unsafe resource URI or oversized resource is skipped/blocked with reason。
- MCP prompt loads as low-priority instruction and cannot override Plan mode or approval policy。
- Resume historical session preserves old tool snapshot after current server schema changes。
- Workspace shared server cannot auto-start until user enables it。

Replay tests：

- exact replay renders server configured/enabled/connected/discovery/tool hidden/resource loaded events。
- deterministic replay with MockProvider covers MCP tool call success、approval denied、server unavailable 和 timeout。
- replay covers schema conflict、blocked tool、resource skipped、prompt loaded 和 disabled server。

Manual acceptance：

1. 启动 `mineco tui`。
2. 添加一个 fixture stdio MCP server。
3. 打开 `MCP` view，确认 server source、trust、transport、connection state 正确。
4. Refresh discovery，确认 `Tools` view 显示 MCP tools 和 schema summary。
5. 发送任务让 agent 调用只读 MCP tool，确认 ToolRuntime events、tool result 和 artifact 行为。
6. 调用一个高风险 fixture MCP tool，确认 approval prompt 显示 origin server、risk 和 sandbox 状态。
7. Deny 高风险 tool，确认 server 未收到调用，模型收到 denied result。
8. 加载一个 MCP resource，确认 filter、Context view 和 artifact 行为。
9. 加载一个 MCP prompt，确认它只作为低优先级 instruction 候选。
10. 禁用 server，确认新 run 中该 server tools 不再可见。
11. 修改 fixture server schema 后 resume 历史 session，确认历史 tool snapshot 仍可审阅。
12. 让 fixture server 崩溃，确认 TUI 显示 failed/degraded，runtime 不崩溃。

## 9. 验收标准

Phase 2 合格必须满足：

- 统一 ToolRegistry 管理内置 tools 和 MCP tools。
- 内置 tools 不绕过 ToolRegistry，MCP tools 不绕过 ToolRuntime。
- 一个本地 stdio MCP server 能被配置、启用、启动、discovery、禁用和重载。
- TUI 能显示 MCP server、connection state、source、trust、tools、resources、prompts、hidden/blocked reason 和 last error。
- MCP tool schema 能映射成 RuntimeToolSpec；无法安全映射的 tool 被 blocked/hidden。
- Tool name 在一个 session 内稳定、唯一，并能追踪原始 server/tool 来源。
- MCP tool call 走 ToolRuntime 的 input validation、permission merge、approval、timeout、cancel、redaction 和 artifact path。
- 高风险或未知风险 MCP tool 默认触发 approval 或被 blocked。
- Approval deny 后 server 不应收到 tool call，runtime 追加 denied ToolResultItem。
- MCP resource 进入模型前经过 URI/mime/size/trust/secrets/context budget filter。
- MCP prompt 只能作为低优先级 instruction 候选，不能覆盖 runtime policy、Plan mode 或 approval。
- Workspace shared MCP server 默认低信任，不能自动扩大权限或自动启动外部进程。
- 禁用 MCP server 后，后续 run 的 visible tools 不包含该 server tools。
- MCP server failed/degraded/timeout 不会让 AgentCore、TUI 或 session store 崩溃。
- run 保存 visible tool snapshot，replay 和 resume 不依赖当前 MCP server 状态。
- replay tests 不调用真实 provider 也能验证 discovery、approval、tool execution、resource filtering 和 disabled server 行为。

## 10. 非目标

Phase 2 不做：

- Agent Skills loader、activation resolver 或 builtin skills；这些属于 Phase 3。
- 远程 MCP registry、server marketplace 或自动安装 MCP server。
- 插件包、插件市场或 tool contribution API；这些属于 Phase 6。
- provider abstraction、model picker、usage ledger 或 provider-specific tool rendering；这些属于 Phase 4。
- 完整 connector/OAuth 生命周期。
- 自动信任 workspace MCP server。
- 让 MCP prompt 变成高优先级 system/runtime instruction。
- 让 MCP tool 自己声明即可获得 filesystem、network、shell、secrets 或 destructive 权限。
- WebSocket MCP transport 的正式验收。
- 企业策略管理。
- hosted SaaS、remote worker 或后台 scheduler。
- subagent、fork mode 或 agent team。

## 11. 已知限制

- Phase 2 gate 只要求 stdio MCP transport 稳定；HTTP/SSE 可以预留或 feature flag，不作为验收硬门槛。
- MCP server 是外部进程或 endpoint，runtime 可以控制调用入口、env、timeout、approval 和 output，但无法证明 server 内部没有隐藏副作用；未知风险默认保守处理。
- MCP tool read-only/destructive metadata 可能不完整；缺失时按未知/高风险处理会让部分工具需要额外 approval。
- Workspace shared MCP 默认低信任会增加首次启用步骤，这是有意的安全取舍。
- Resource filter 第一版优先支持 text/JSON/Markdown 类内容；binary resource 默认 artifact/ref，不 inline。
- Tool alias 第一版可以保守处理冲突，不要求提供复杂 alias 管理 UI。
- MCP prompts 第一版只做候选加载和 source tracking，不做 prompt marketplace 或复杂模板编辑器。
- Server restart/reconnect 第一版只要求手动 refresh 和有限 retry，不要求长期守护进程级可靠性。

## 12. 退出条件

Phase 2 结束前必须完成 phase gate：

- 当前产品界面可启动。
- `MCP` view、`Tools` view、`Context` view 和 approval prompt 能完成手工验收。
- 自动测试、integration tests 和 replay tests 通过。
- session store 可查看 MCP server/tool/resource/prompt snapshot 和相关 runtime events。
- server disabled、server failed、schema conflict、approval denied、resource blocked、prompt loaded 和 resume 后 tool snapshot 都有明确行为。
- P2 文档、总路线图状态和文档审计同步。
- 已知限制记录清楚。

Phase 2 结束后，Mineco 的 tool ecosystem 应形成稳定边界：任何内置 tool、MCP tool、后续 skill script、connector tool 或 plugin tool 都必须先成为带 source metadata 的 RuntimeToolSpec，再经过 ToolRegistry visibility、availability、permission merge、ToolRuntime 执行、approval、artifact 和 audit。Phase 3 可以在这个基础上接入 Agent Skills，而不需要重写工具权限模型。

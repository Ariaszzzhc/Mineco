# 开发计划

版本：0.1 草案

状态：规划基线

相关文档：

- [AI Agent Runtime 设计](../architecture/agent-runtime-design.md)
- [Agent Runtime 协议](../protocol/agent-runtime-protocol.md)
- [路线图索引](README.md)
- [Phase 0 本地 Agent 执行架构](phase-0-local-agent-execution.md)
- [开发工作流和规范](../process/development-workflow-and-standards.md)

语言：中文

## 1. 计划原则

开发按 agent/runtime 功能能力纵向切片推进。当前产品界面是第一 interface，用来承载交互和验收；Phase 0 使用 REPL-style terminal loop，后续演进到 TUI。roadmap 不按 UI 模块切分。

每个阶段都要满足：

- 用户能通过当前 interface 完成真实 coding 场景；Phase 0 默认 interface 是本地 REPL。
- Runtime 边界不被绕过。
- 高风险动作有 approval。
- 关键状态可落盘。
- 有自动测试和手工验收。
- 阶段完成后可以直接进入下一阶段，不需要重写前一阶段。

## 2. 阶段总览

```text
Phase 0  Local Agent Execution
Phase 1  Reliability and Reviewability
Phase 2  MCP and Tool Ecosystem
Phase 3  Agent Skills
Phase 4  Provider Abstraction
Phase 5  Long-Running Coding Agent
Phase 6  Automation and Extensibility
```

阶段文档：

- [Phase 0 本地 Agent 执行架构](phase-0-local-agent-execution.md)
- [Phase 1 可靠性与可审阅性](phase-1-reliability-and-reviewability.md)
- [Phase 2 MCP and Tool Ecosystem](phase-2-mcp-and-tool-ecosystem.md)
- [Phase 3 Agent Skills](phase-3-agent-skills.md)
- [Phase 4 Provider Abstraction](phase-4-provider-abstraction.md)
- [Phase 5 Long-Running Coding Agent](phase-5-long-running-coding-agent.md)
- [Phase 6 Automation and Extensibility](phase-6-automation-and-extensibility.md)

## 3. Phase 0: Local Agent Execution

### 3.1 目标

交付本地 coding agent 的最小执行闭环。用户可以在项目目录中通过 REPL 启动 Electrolyte，输入任务，让 agent 读文件、搜索文件、运行命令、修改文件或给出明确结论。

### 3.2 用户能力

- 在 REPL 输入 coding 任务。
- 看到 assistant 输出；如果 provider 支持 streaming，则显示增量输出。
- 看到 tool call 和 tool result。
- 运行测试、构建或诊断命令。
- 允许 agent 写 workspace 文件。
- 对危险 shell/write 操作 approve 或 deny。
- 退出后查看历史 session。

### 3.3 必做范围

产品：

- REPL 启动命令。
- 启动时显示 workspace、model、sandbox status。
- Main event stream printing。
- Prompt input。
- 简单 approval prompt。
- 简单 session history。

Runtime:

- Runtime SDK：`createSession`、`runSession`、`sendMessage`、`decideApproval`、`cancelSession`、`listSessions`、`getSession`、`getActiveRun`、`listRuntimeEvents`、`listProviderEvents`、`listApprovals`、`listArtifacts`、`readArtifact`。
- AgentCore 最小 run loop。
- ContextManager 第一版。
- RuntimeEvent stream。
- SQLite session store，items/events 逻辑上 append-only。
- Node.js-first runtime/toolchain。
- Kysely query builder and migrations。
- Effect structured concurrency。
- LogTape diagnostic logging。

Tools:

- `file.list`
- `file.search`
- `file.read`
- `file.write`
- `shell.run`

Provider:

- OpenAI-compatible Chat Completions provider adapter。
- Phase 0 最低要求 Level 2 Tool Calling：native tools 或可靠 JSON fallback。
- Streaming 可选，不支持 streaming 时 adapter 合成 final assistant message。
- MockProvider 只用于测试。

Security:

- workspace read/write boundary。
- sandbox runner interface。
- degraded sandbox 状态：所有 shell.run approval，cwd/timeout/output/env redaction 强制，明确网络命令默认拒绝。
- 基础 approval。

测试：

- Vitest。
- SDK integration tests。
- MockProvider tool-call tests。
- tool policy tests。
- 手工验收任务。

### 3.4 非目标

- 完整 Agent Skills 自动发现。
- MCP。
- 多 provider fallback。
- 长期记忆。
- 完整 diff/test view。
- 插件系统。
- 自动化调度。

### 3.5 验收标准

- `electrolyte` 能在 workspace 启动。
- 用户能输入任务并看到 agent 执行。
- agent 能读文件、搜索文件、运行 shell。
- agent 能写 workspace 文件。
- 危险 write/shell 操作触发 approval。
- session、items、runtime events 能落到 SQLite。
- OpenAI-compatible endpoint 可配置并完成任务。
- MockProvider 测试通过。

### 3.6 退出条件

Phase 0 结束时，interface 不需要精致，但 runtime event stream、session store 和 ToolRuntime 边界必须稳定到足以支撑 Phase 1。

## 4. Phase 1: Reliability and Reviewability

### 4.1 目标

把本地 agent 变成日常 coding 任务可依赖的工具，并引入最小 TUI shell。重点是可审阅、可中断、可恢复、可验证，并通过最小 Plan mode 支持“只读规划、用户批准、再执行”的结构化工作流。

### 4.2 用户能力

- 查看 agent 修改了哪些文件。
- 查看 diff。
- 一键重跑最近测试命令。
- interrupt / cancel 当前 run。
- 从历史 session 恢复继续。
- 查看大输出 artifact。
- 对相似命令做一次性或前缀级 approval。
- 在只读 Plan mode 中先审阅计划，批准后再执行。

### 4.3 必做范围

产品：

- 最小 TUI shell：event stream、input、approval prompt、session header。
- Diff view。
- Test view。
- Tool output artifact viewer。
- 完整 approval UI：approve once、deny、approve similar prefix。
- interrupt / cancel UI。
- session resume UI。
- Plan mode UI：active plan、plan artifact、plan approval。

Runtime:

- cancellation propagation。
- session resume。
- SDK history readers for runtime events、provider events、approvals and artifacts。
- provider state 缺失后的 transcript replay。
- large output artifact handling。
- run status consistency。
- basic checkpoint placeholder。
- read-only Plan mode、plan artifact、plan approval、恢复原 permission mode。

Tools:

- `git.status`
- `git.diff`
- `file.patch` 或 `git.apply_patch`
- `test.rerun` 可先作为 `shell.run` wrapper。

Context:

- recent-window selection。
- summary placeholder。
- unresolved tool/error 优先保留。
- active plan summary 和 checkpoint summary 优先保留。

测试：

- replay tests。
- resume tests。
- approval tests。
- artifact tests。
- plan mode tests。

### 4.4 非目标

- 自动 skill activation。
- MCP。
- 多 provider fallback。
- 长期 memory。
- browser verification。
- subagent / fork mode / 独立 verifier。

### 4.5 验收标准

- 用户能完成一次“修复失败测试”的完整流程。
- diff view 能展示 agent 造成的文件修改。
- test view 能展示最近命令和失败摘要。
- cancel 后 session 状态正确。
- 重启后能恢复未完成或历史 session。
- 大 terminal output 不会直接塞满 transcript。
- replay tests 不调用真实 provider 也能验证 run loop。
- Plan mode 下写入和副作用工具不可用，批准计划后才能进入执行。

### 4.6 退出条件

Phase 1 结束后，Electrolyte 应该可以作为主力本地 coding agent 使用。后续增强应该主要是能力扩展，而不是可靠性补洞。

## 5. Phase 2: MCP and Tool Ecosystem

### 5.1 目标

把 MCP 作为受控能力来源接入，并把内置 tools、MCP tools 和后续 skill scripts 统一到 ToolRuntime / ToolRegistry 边界下。

### 5.2 用户能力

- 配置 MCP server。
- 在当前 interface 查看 MCP server 状态、tools、resources 和 prompts。
- 启用或禁用 MCP server。
- 允许或拒绝 MCP tool 调用。
- 查看 MCP tool output、artifact 和 approval 记录。

### 5.3 必做范围

MCP：

- MCP client manager。
- stdio transport。
- HTTP/SSE transport adapter 预留；可作为 feature flag 或后续切片，不进入 Phase 2 gate。
- connection lifecycle/state。
- tool discovery。
- resource discovery。
- prompt discovery。
- MCP tool schema -> RuntimeToolSpec。
- 稳定 tool naming 和冲突处理。

Runtime:

- Unified ToolRegistry。
- Tool source metadata。
- Tool visibility。
- Permission merge。
- visible tool snapshot。
- MCP resource context filter。

产品：

- MCP server list。
- MCP connection state。
- MCP tool list。
- MCP resource / prompt list。
- MCP enable/disable。
- MCP tool approval display。
- hidden/blocked tool reason。

Security:

- workspace MCP 默认低信任。
- MCP tool 不等于授权。
- MCP prompt 只能作为低优先级 instruction 候选。
- MCP tool 不能绕过 ToolRuntime。
- 未知风险 MCP tool 默认保守处理。

### 5.4 非目标

- Agent Skills loader。
- 远程 MCP registry。
- HTTP/SSE/WebSocket transport 正式验收。
- 插件包。
- 自动信任 workspace MCP。

### 5.5 验收标准

- 一个本地 stdio MCP server 能被启动并列出 tools。
- MCP tool call 走 ToolRuntime。
- 高风险 MCP tool 调用触发 approval。
- MCP resource 进入模型前经过 filter。
- MCP prompt 不能覆盖 runtime policy。
- 当前 run 保存 visible tool snapshot，历史 session 可 replay。
- 禁用 MCP server 后 tool 不再对模型可见。

### 5.6 退出条件

Phase 2 结束后，内置 tools 和 MCP tools 都通过同一个 ToolRuntime 和 ToolRegistry 管理。Agent Skills 会在 Phase 3 接入，并复用这一阶段形成的 tool source、permission merge 和 visibility 边界。

## 6. Phase 3: Agent Skills

### 6.1 目标

接入 Agent Skills 标准，让 agent 能按语言、框架、任务类型加载专业工作流，并复用 Phase 2 已经形成的 ToolRegistry、tool source metadata、permission merge 和 visibility 边界。

### 6.2 用户能力

- 指向或安装标准 Agent Skill 目录。
- 在 TUI 看到 active skills。
- 看到 skill 对 context 的影响。
- 针对 TypeScript、git workflow、code review 使用内置 coding skills。

### 6.3 必做范围

Skills：

- 扫描 skill 目录。
- 读取 `SKILL.md` frontmatter 的 `name` 和 `description`。
- trigger resolver：explicit、file pattern、semantic。
- 触发后加载 `SKILL.md` body。
- references/scripts/assets progressive loading 基础支持。

内置 skills：

- `coding-core`
- `repo-orientation`
- `typescript-coding`
- `git-workflow`
- `code-review`

产品：

- Context view。
- Active skills list。
- Skill enable/disable。

Runtime:

- InstructionBlock source tracking。
- skill instructions priority。
- skill `allowed-tools` hints 映射到 tool visibility 解释。

Security:

- skill 不能提升权限。
- skill script 必须走 ToolRuntime 或受控执行器。
- skill 不能自动启用 MCP server。

### 6.4 非目标

- 重新实现 MCP tool ecosystem。
- provider abstraction、model picker、usage ledger 或 provider-specific skill routing。
- 远程 skill registry。
- 插件包。
- 自动执行未授权 skill script。

### 6.5 验收标准

- 一个标准 `SKILL.md` skill 能被发现。
- 用户显式启用 skill 后，TUI 显示 active skill。
- TypeScript 项目中能触发 `typescript-coding` workflow。
- skill body 只在触发后进入 context。
- skill 无法绕过 approval 或 workspace boundary。

### 6.6 退出条件

Phase 3 结束后，coding agent 的行为可以通过标准 Agent Skills 扩展，而不需要修改核心 prompt 或 runtime。skills、tools 和 MCP 仍保持清晰边界，并为 Phase 4 Provider Abstraction 保留 provider-neutral 扩展点。

## 7. Phase 4: Provider Abstraction

### 7.1 目标

扩展多供应商支持，同时保持 AgentCore、TUI 和 skills 不依赖 provider-specific shape。

### 7.2 用户能力

- 在当前 interface 选择 provider/model。
- 查看当前 model、token、cost。
- provider 不可用时使用安全 fallback。
- 了解 fallback 发生的原因。

### 7.3 必做范围

Providers:

- OpenAI-compatible Chat Completions adapter。
- OpenAI Responses adapter。
- Anthropic Messages adapter。
- Local JSON fallback adapter。
- Provider capability registry。
- Model selector。

Runtime:

- capability-driven routing。
- safe fallback policy。
- usage ledger。
- provider error normalization。
- provider state persistence。

测试：

- adapter fixture tests。
- capability accuracy tests。
- recorded provider event replay。
- unsupported content tests。

产品：

- model picker。
- provider/model status。
- token/cost display。
- fallback notification。

### 7.4 非目标

- 追求所有供应商。
- 自动 benchmark routing。
- 跨供应商发送敏感上下文的隐式 fallback。
- provider marketplace。

### 7.5 验收标准

- 同一 coding task 能在两个真实 provider 中运行。
- TUI 不需要知道 provider 私有字段。
- fallback 前检查 capabilities。
- provider auth/rate limit/context errors 有清晰 UI。
- usage ledger 能记录 input/output/cached/reasoning tokens 中可得字段。

### 7.6 退出条件

Phase 4 结束后，多供应商接入边界稳定，新 provider 应该主要实现 adapter 和 fixtures。

## 8. Phase 5: Long-Running Coding Agent

### 8.1 目标

支持更长、更复杂、可暂停和可恢复的 coding 任务。

### 8.2 用户能力

- 让 agent 持续修复一组失败测试。
- 中途暂停、恢复、插话。
- 对前端任务使用 browser 验证。
- 查看 checkpoints 和 compacted summaries。
- 使用 code review mode。

### 8.3 必做范围

Runtime:

- checkpoints。
- runtime compaction。
- resume after compaction。
- interruption handling。
- run retry。
- better failure recovery。

Tools:

- browser navigation/screenshot 基础工具。
- frontend verification path。
- focused code review mode。

Context:

- summary item generation。
- plan summary。
- tool trace summary。
- context budget diagnostics。

状态：

- Memory store 第一版。
- metrics/tracing。

产品：

- checkpoint display。
- compaction indicator。
- browser artifact viewer。
- code review findings view。

### 8.4 非目标

- 完整 agent team / swarm 产品化。
- 生产级 coordinator/worker 调度系统。
- 完整自动化 scheduler。
- 插件 registry。

### 8.5 验收标准

- 长 session 超过上下文窗口后能 compact 并继续。
- 用户插话能 interrupt 或 queue。
- checkpoint 能恢复关键状态。
- frontend task 能启动/检查页面并产出 artifact。
- code review mode 能输出可定位 findings。

### 8.6 退出条件

Phase 5 结束后，agent 可以处理跨多轮、多命令、多文件的复杂 coding 工作，而不是只做短任务。

受限 subagent / worker 概念是 Phase 5 的设计方向之一，用于未来扩展到 agent team 或 agent swarm；本阶段只允许在明确权限、写入范围、最大 turn 数和取消传播边界下实验。

## 9. Phase 6: Automation and Extensibility

### 9.1 目标

在个人本地使用场景下，增加后台任务、本地 API 和扩展机制。

### 9.2 用户能力

- 创建定时 coding/check 任务。
- 通过本地 HTTP/SSE API 控制 session。
- 安装或启用插件包。
- 导出本地运行日志。
- 运行 eval harness。

### 9.3 必做范围

自动化：

- scheduler。
- scheduled task store。
- automation run history。
- notification hooks。

API:

- local HTTP API。
- SSE event stream。
- session/run/approval endpoints。

扩展性：

- plugin package。
- provider adapter plugin API。
- tool contribution API。
- local registry。

评估：

- eval harness。
- recorded task suites。
- cost/latency/success metrics。

### 9.4 非目标

- 托管 SaaS。
- 多用户权限系统。
- 企业策略管理。

### 9.5 验收标准

- 定时任务能创建、暂停、运行并记录历史。
- 本地 API 能创建 session、stream events、提交 approval。
- 插件能贡献一个 tool 或 provider adapter。
- eval harness 能运行固定 coding task suite。

### 9.6 退出条件

Phase 6 结束后，Electrolyte 从本地 coding agent 产品扩展为可自动化、可扩展、可评估的本地 agent runtime。

## 10. 跨阶段不变量

这些规则所有阶段都不能破坏：

- 产品界面不直接执行工具或调用 provider。
- Provider Adapter 不执行 tools。
- ToolRuntime 是唯一工具执行路径。
- Sandbox 是技术边界，approval 是越界决策。
- transcript source of truth 是 session store 中的结构化 `items`。
- provider state 只是优化。
- skills/MCP/plugins 不能提升权限。
- 大输出必须 artifact 化或摘要化。
- 每个阶段都必须能通过当前 interface 验收；Phase 0 默认 interface 是 REPL。

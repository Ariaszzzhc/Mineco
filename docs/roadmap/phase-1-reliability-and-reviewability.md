# Phase 1 可靠性与可审阅性

版本：0.2 详细规划

状态：详细规划

相关文档：

- [开发计划](development-plan.md)
- [Phase 0 本地 Agent 执行架构](phase-0-local-agent-execution.md)
- [AI Agent Runtime 设计](../architecture/agent-runtime-design.md)
- [Agent Runtime 协议](../protocol/agent-runtime-protocol.md)
- [开发工作流和规范](../process/development-workflow-and-standards.md)
- [Claude Code Book 整体分析](../research/claude-code-book/overall-analysis.md)

语言：中文

## 1. 阶段定位

Phase 1 不重写 Phase 0，而是在同一 Runtime SDK、RuntimeEvent、ToolRuntime 和 session store 边界上增强可靠性与可审阅性。

Phase 0 的目标是“能跑”。Phase 1 的目标是“日常可依赖”：用户能在本地 agent 执行真实 coding 任务时，清楚看到它做了什么、能安全中断、能恢复继续、能审阅修改、能重放关键路径，并能在执行前通过最小 Plan mode 降低方向性错误。

Phase 1 的主轴：

1. 最小 TUI shell 成为 REPL 之后的增强 interface，但不能绕过 Runtime SDK。
2. Reviewability 覆盖 changed files、diff、test result、tool output artifact、approval log 和 plan artifact。
3. Reliability 覆盖 cancellation propagation、run status consistency、session resume、provider state 缺失后的 transcript replay 和 large output artifact handling。
4. 最小 Plan mode 作为 runtime permission mode 引入：只读探索、生成计划、用户批准后恢复原权限模式执行。

Phase 1 结束后，Mineco 应该可以作为主力本地 coding agent 处理短到中等复杂度的本地代码任务。跨长上下文、多 checkpoint、browser verification、subagent verifier 和后台长任务仍属于 Phase 5+。

## 2. Phase 0 前置条件

Phase 1 默认 Phase 0 已经交付：

- `mineco` REPL 可启动，并通过 Runtime SDK 消费 RuntimeEvent。
- AgentCore、ToolRuntime、Provider Adapter、ContextManager 和 Store 边界稳定。
- SQLite session store 保存 sessions、runs、items、runtime_events、provider_events、approvals 和 artifacts metadata。
- `file.list`、`file.search`、`file.read`、`file.write`、`shell.run` 可用。
- OpenAI-compatible provider adapter 和 MockProvider 可用。
- 基础 workspace boundary、sandbox runner interface 和 approval gate 可用。
- 大输出至少能写 artifact，并在 transcript 中保留摘要或 artifact ref。

如果实现时发现前置条件缺失，应补齐 Phase 0 边界，而不是在 TUI 或 Phase 1 功能里直接调用 provider、shell、filesystem 或 store。

## 3. 用户场景

Phase 1 必须能覆盖这些端到端场景：

- 修复失败测试：用户在 TUI 中发起任务，agent 运行测试、定位问题、应用 patch、展示 diff、重跑测试并给出验证结果。
- 审阅 agent 修改：用户能查看 changed files、按文件查看 diff、打开长 diff artifact，并根据结果继续对话或要求回滚。
- 中断异常 run：用户能 cancel 正在运行的 provider request、shell process、approval wait 或 tool execution，session 状态落盘且可解释。
- 恢复历史 session：重启后能打开历史 session，查看 events、artifacts、approvals 和最新状态；对未完成 session 可以恢复继续或明确终止。
- provider state 缺失恢复：当 provider opaque state 不存在、过期或不支持时，runtime 能从 transcript items 重新准备 provider input。
- 大输出审阅：长 terminal output 不进入完整模型上下文，TUI 能打开 artifact，模型只看到摘要和关键尾部。
- 前缀级 approval：用户对相似 shell 命令可选择 approve once、deny 或 approve similar prefix，决策来源和作用域可审计。
- 先计划再执行：用户进入 Plan mode 后，agent 只能只读探索并生成 plan artifact；用户批准后才进入执行阶段。

## 4. 用户能力

Phase 1 用户应能：

- 启动 `mineco tui` 或等价入口。
- 在 TUI 中输入任务、追问、取消当前 run、恢复历史 session。
- 查看 session header：workspace、branch、model、sandbox 状态、session/run 状态。
- 查看 RuntimeEvent stream、assistant message、tool calls、tool results 和 terminal reasons。
- 查看 changed files、`git.status` 和 `git.diff`。
- 查看最近测试命令、exit code、失败摘要，并一键重跑最近测试命令。
- 查看 tool output artifact、terminal log artifact 和 diff artifact。
- 对 approval request 执行 approve once、deny、approve similar prefix。
- 在 Plan mode 中批准或拒绝计划。
- 在 REPL 中继续完成 Phase 0 能力；REPL 可不提供完整 pane，但不能被破坏。

## 5. 必做范围

### 5.1 Product / Interface

最小 TUI shell 是 Phase 1 的默认验收 interface。它必须通过 Runtime SDK 驱动 runtime，只维护本地 UI state，例如 pane、selection 和 scrollback。

历史 session、Logs、Approvals 和 Artifacts 视图不得直接读 SQLite。TUI 必须通过 `getSession`、`getActiveRun`、`listRuntimeEvents`、`listProviderEvents`、`listApprovals`、`listArtifacts` 和 `readArtifact` 分页读取历史数据。

TUI 最小布局：

- Header：workspace、branch、model、sandbox、session status、active run status。`session status` 来自 `sessions.status`，`active run status` 来自 active run 或 `run.status_changed`，不得把 `waiting_for_tool`、`waiting_for_approval`、`cancelling` 写入 session status。
- Left pane：session list、active plan、changed files。
- Main pane：conversation、run events、tool calls、tool results、approval prompt、final answer。
- Bottom pane：task input、interrupt/cancel 状态、最近测试命令。

TUI 最小视图：

- `Run`：用户任务、assistant 更新、RuntimeEvent stream、terminal reason。
- `Diff`：changed files、file-level diff、长 diff artifact ref。
- `Tests`：最近测试命令、exit code、失败摘要、rerun action。
- `Tools`：tool call 队列、approval 状态、denied actions、artifact refs。
- `Artifacts`：terminal log、diff、report artifact viewer。
- `Context`：token estimate、dropped item count、active summary、plan summary。
- `Logs`：完整 event log，默认折叠。

TUI 必须支持的交互：

- 发送新任务或追问。
- interrupt / cancel 当前 run。
- approve once、deny、approve similar prefix。
- 打开 diff 和 artifact。
- 从 session list 打开历史 session。
- 对历史或未完成 session 选择 resume。
- 进入和退出 Plan mode。

TUI 不得：

- 直接调用 provider SDK。
- 直接执行 shell。
- 直接读写 workspace 文件。
- 自己决定 approval。
- 修改 transcript。

### 5.2 Runtime

Runtime 必须完成：

- `cancelSession` 的完整 propagation：provider request、tool call、shell process、approval wait、store lock 和 pending stream 都必须挂在 run scope 下。
- run status consistency：`created`、`running`、`waiting_for_tool`、`waiting_for_approval`、`cancelling`、`completed`、`failed`、`cancelled` 必须有明确转换和 terminal reason。
- active run 约束：同一 session 同时只能有一个 active run，数据库约束仍是最终保护。
- pending approval recovery：重启后能显示未决 approval，或根据 policy 明确终止旧 run。
- session resume：支持打开历史 session、继续 completed session、为 cancelled/failed session 创建恢复用的新 run。
- transcript replay：provider state 缺失、过期或 provider capability `providerState=false` 时，从 `items` 重新构造 provider input。
- exact replay：不调用模型，只重放 runtime events，用于 TUI/debug。
- deterministic replay：使用 MockProvider 或 recorded provider fixture 重新执行 runtime，用于测试。
- large output artifact handling：工具结果超过 inline limit 时写 artifact，模型上下文只保留摘要、尾部错误和 artifact ref。
- basic checkpoint placeholder：在关键状态点生成 `CheckpointItem` 或 checkpoint ref，至少保存当前 session/run、latest item seq、changed files summary、active plan summary 和 artifact refs。任意 checkpoint restore 不是 Phase 1 必做。
- RuntimeEvent 扩展保持 dot event name，不回退到 snake_case。

Phase 1 允许增加 runtime 事件，但必须保持 Phase 0 消费者可继续渲染未知事件的摘要。

Phase 1 必须使用 Phase 0 已闭合的 SDK 读取接口支撑 TUI：

- `getSession`：读取 session 当前状态和 transcript items，不包含 event log。
- `getActiveRun`：读取当前 active run，用于 Header 和 resume/cancel 判断；没有 active run 时返回 `null`。
- `listRuntimeEvents`：分页读取 runtime event log，用于 Run/Logs/replay。
- `listProviderEvents`：分页读取 provider event log，用于 debug/replay，不直接作为普通 UI 主数据源。
- `listApprovals`：分页读取 approval request、decision、matched rule 和 sandbox snapshot。
- `listArtifacts`：分页读取 artifact metadata。
- `readArtifact`：读取 artifact metadata 和内容，用于 artifact viewer。

### 5.3 Plan Mode

Phase 1 引入最小 Plan mode，因为它直接服务 reviewability 和可靠执行。

Plan mode 必须是 runtime permission mode，不是普通 prompt 或 slash command。进入 Plan mode 时：

- runtime 切换到只读权限集。
- 允许 `file.list`、`file.search`、`file.read`、`git.status`、`git.diff` 等只读工具。
- 默认禁止 `file.write`、`git.apply_patch`、destructive shell、提交代码、安装依赖、网络下载和外部副作用。
- 如需 shell 探索，只允许明确 read-only allowlist，并仍通过 ToolRuntime 和 approval policy。
- TUI 显示当前处于 Plan mode。

退出 Plan mode 时：

- runtime 生成 plan artifact，并保存 `SummaryItem(kind="plan")`；大计划内容写 artifact，summary 中保留 artifact ref。
- runtime 发出 `plan_approval` 类型的人类介入请求。
- 用户批准后，runtime 恢复进入 Plan mode 前的 permission mode，并以该 plan 作为执行上下文继续。
- 用户拒绝后，session 保留 plan artifact 和拒绝记录，但不执行写入或副作用。

Phase 1 只要求执行后做轻量 plan 对照：最终回答和 event log 应能说明计划步骤哪些完成、哪些跳过、原因是什么。独立 verifier/subagent、team lead 审批流和复杂 plan recovery 属于 Phase 5+。

### 5.4 Tools

Phase 1 model-visible built-in tools：

- `git.status`：只读，返回当前 branch、changed files、staged/unstaged/untracked 摘要。
- `git.diff`：只读，返回短 diff；长 diff 写 artifact。
- `git.apply_patch`：写入型 patch 工具，作为 Phase 1 推荐主编辑路径，减少 Phase 0 `file.write` 整文件覆盖风险。

兼容说明：

- 如果 workspace 不是 Git repository，runtime 可以提供 `file.patch` 作为同等语义 fallback；但 Phase 1 不应把整文件 `file.write` 作为主要编辑路径。
- `test.rerun` 可以先作为 Runtime/UI action 或 model-visible wrapper，内部复用最近一次测试类 `shell.run` 命令。它必须显示将要执行的命令，并按 shell policy 决定是否需要 approval。

工具定义必须补齐或落地执行元数据：

- `readOnly`。
- `destructive`。
- `concurrency`：只读工具可并发，write/shell/patch 默认 exclusive。
- `inlineOutputLimitBytes`。
- `artifactStrategy`。
- `resultOrdering`。
- progress event schema 可先占位，但不能阻塞最终结果顺序。

工具结果写入 transcript 时，即使底层并发完成，也必须保持模型可理解的顺序。默认按 call order 写入，除非工具定义显式声明可以按 completion order。

### 5.5 Approval / Security

Phase 1 approval 必须从 Phase 0 的简单 y/n 升级为可审计的决策模型。

必须支持：

- approve once。
- deny。
- approve similar prefix。
- stable `ApprovalRequest.id` 作为 UI decision 主键，不能使用 `callId` 替代。
- approval request 显示 tool name、risk、reason、cwd、input preview、sandbox 状态和匹配 policy。
- 被拒绝时追加 `status="denied"` 的 `ToolResultItem`，并反馈给模型。

决策规则：

- deny 优先于 ask，ask 优先于 allow。
- 低信任 workspace shared config 不能扩大危险权限。
- approve similar prefix 只能缩小到同类 shell prefix、同 workspace、同 risk 上限和同 sandbox 状态。
- permission context 是本次 tool request 创建时的不可变快照；后续新增 approval rule 不能 retroactively 改变已经在检查中的请求。
- 同一 approval request 只能有一个最终决定。
- degraded sandbox 下继续保持更严格策略：不承诺 OS 级隔离，shell 默认需要 approval，明确 install/download/curl/wget/git clone 等网络或安装命令默认拒绝，不能通过 approval 放行。只有 enforced sandbox 且 network policy 可控时，网络类 shell 命令才可以按 policy 请求 approval。

需要落盘的审计字段：

- decision source：user、policy、runtime。
- decision scope：once、prefix、session、workspace。
- matched prefix 或 rule id。
- risk 和 sandbox snapshot。
- created_at、decided_at、expires_at。

### 5.6 Context / Artifacts

Phase 1 ContextManager 必须从 Phase 0 的简单 recent transcript 升级到可诊断的 budget-driven selection。

必须支持：

- `ContextBudget`：model window、reserved output、reserved tool tokens、effective input、warning/compact/blocking thresholds、compaction failure count。
- recent-window selection。
- 当前用户任务强保留。
- 未解决 tool call、tool result、error、approval 强保留。
- active plan summary 和最近 checkpoint summary 优先保留。
- 长 terminal output、长 diff、大文件内容只保留摘要、尾部关键内容和 artifact ref。
- 超过 warning threshold 时记录诊断事件。
- 超过 blocking threshold 且无法安全裁剪时，以 `TerminalReason="context_blocked"` 终止。

Phase 1 只要求 summary placeholder 和 artifact/snip/collapse 的基础策略。完整 runtime compaction、compaction failure circuit breaker 的复杂恢复和跨长任务摘要质量优化属于 Phase 5。

Artifact viewer 必须支持：

- terminal log artifact。
- diff artifact。
- report artifact。
- plan artifact。
- artifact metadata：kind、size、mime、sha256 或等价完整性信息、model-visible summary。

## 6. 数据模型变化

Phase 1 的 schema change 必须通过 migration 完成，并保持 Phase 0 session 可读。

需要新增或扩展：

- `runs`：补齐 `cancelling` 状态、terminal reason、cancel reason、ended_at consistency；`terminated` 不入库为 status。
- `runtime_events`：支持 P1 新事件，保持 append-only。
- `artifacts`：补齐 kind、mime、size、sha256、model-visible summary；支持 `terminal_log`、`diff`、`report`、`plan`，并遵守架构文档中的 `ArtifactKind` union。
- `approvals`：补 decision source、decision scope、matched rule/prefix、sandbox snapshot、expires_at。
- `approval_rules` 或等价结构：保存用户批准的 similar prefix rule，记录来源、作用域、风险上限和过期策略。
- `items`：支持 `SummaryItem(kind="plan")` 和 `CheckpointItem`。
- `sessions`：保存 resume 所需的 current session status、terminal reason、last run status、updated_at 和 workspace/model snapshot。current session status 只允许 `created`、`running`、`waiting_for_user`、`completed`、`failed`、`cancelled`；run 中间态只保存到 `runs.status`。

约束：

- `items` 仍是 transcript source of truth。
- `provider_state` 只能是优化，不能成为 resume 的唯一依据。
- UI state 不进入 session store。
- migration 要有测试，不能依赖手工修库。

## 7. 实现切片

Phase 1 按可验收的纵向切片推进，不按 UI 模块或底层模块横切。

### P1.1 Runtime 状态和取消硬化

- 明确 P1 run status state machine。
- 实现 run scope 下的 cancellation propagation。
- 修复 pending approval、tool execution、shell process 和 provider stream 的取消路径。
- 补 terminal reason 和 store consistency 测试。

验收：用户 cancel 后，TUI/REPL 都显示明确 terminal reason；重启后 session 状态不是半悬挂。

### P1.2 可审阅编辑路径

- 实现 `git.status`、`git.diff`、`git.apply_patch`。
- 长 diff 写 artifact。
- patch 工具记录修改前后摘要和失败原因。
- `file.write` 保留但不作为首选编辑路径。

验收：agent 能用 patch 修复小项目失败测试；用户能看到 changed files 和 diff。

### P1.3 测试和 artifact 工作流

- 记录最近测试类 shell 命令。
- 实现 test rerun action。
- 提取失败摘要和 exit code。
- 完成 terminal log artifact viewer。

验收：用户能一键重跑最近测试命令，并从 TUI 打开完整输出 artifact。

### P1.4 最小 TUI shell

- 实现 session header、Run、Diff、Tests、Tools、Artifacts、Context/Logs 基础视图。
- 实现 input、approval prompt、cancel、resume。
- 视图读取历史 events、approvals 和 artifacts 时只调用 Runtime SDK 读取接口。
- REPL 继续可用。

验收：TUI 不直接执行工具或 provider，不直接读 SQLite；所有操作和历史数据读取都能对应 Runtime SDK 调用或 RuntimeEvent。

### P1.5 Resume 和 replay

- 实现历史 session 打开和 resume。
- 使用 SDK 读取历史 runtime events、provider events、approvals 和 artifacts。
- 实现 provider state 缺失后的 transcript replay。
- 实现 exact replay 和 deterministic replay 测试入口。
- 补 corrupted/incomplete run 恢复策略。

验收：删除或忽略 provider state 后，MockProvider fixture 仍可从 transcript 继续执行。

### P1.6 Approval 规则和 Plan mode

- 实现 approve once、deny、approve similar prefix。
- 补 approval audit metadata。
- 实现 read-only Plan mode、plan artifact 和 `plan_approval`。
- 执行后输出轻量 plan 对照结果。

验收：Plan mode 下写入和副作用工具被拒绝；批准计划后恢复原权限模式执行。

### P1.7 Phase gate

- 补齐自动测试、replay fixtures、手工验收脚本和文档同步。
- 对 Phase 1 非目标和已知限制做最终确认。

验收：Phase 1 gate checklist 全部通过。

## 8. 测试计划

自动测试使用 Vitest。Phase 1 必须增加以下测试层：

Unit tests：

- run status state machine。
- cancellation scope 和 timeout 行为。
- approval rule resolver：once、deny、prefix、deny precedence。
- immutable permission snapshot。
- `git.status` output schema。
- `git.diff` 短输出和 artifact threshold。
- `git.apply_patch` 成功、冲突、越界路径。
- ContextBudget selection：recent items、unresolved tool/error/approval、plan summary、checkpoint summary。
- artifact metadata 和 summary 生成。

Integration tests：

- SDK create session -> run -> patch -> diff -> rerun test -> completed。
- cancel running shell 后 session terminal reason 为 `user_aborted`。
- denied approval 写入 denied tool result 并反馈给模型。
- large terminal output 写 artifact，transcript 只保存摘要/ref。
- resume interrupted session 后创建新 run。
- provider state missing 时 transcript replay 继续。
- Plan mode 只读工具可用，写入工具被拒绝，plan approval 后可执行。

Replay tests：

- exact replay 渲染固定 RuntimeEvent，不调用 provider。
- deterministic replay 使用 MockProvider fixture，不调用真实 provider。
- replay 覆盖 completed、tool_denied、user_aborted、tool_error、model_error、context_blocked。
- replay 覆盖 provider state 缺失恢复。

Manual acceptance：

1. 在一个小 TypeScript 项目中启动 `mineco tui`。
2. 输入“找出测试失败原因并修复”。
3. 确认 agent 能运行测试、定位文件、应用 patch。
4. 打开 Diff view，确认 changed files 和 diff 正确。
5. 在 Tests view 一键重跑最近测试命令。
6. 制造长输出命令，确认完整输出进入 artifact。
7. 启动 Plan mode，确认只读计划、plan approval 和批准后执行路径。
8. 在运行中 cancel，重启后 resume session。

## 9. 验收标准

Phase 1 合格必须满足：

- `mineco tui` 或等价入口能启动最小 TUI shell。
- REPL 和 TUI 都只通过 Runtime SDK 与 runtime 交互。
- TUI 能通过 SDK 显示 session header、run events、tool calls、approval prompt、changed files、diff、tests、approval log 和 artifacts。
- 用户能完成一次“修复失败测试”的完整流程。
- agent 优先使用 patch 工具修改文件，而不是整文件覆盖。
- diff view 能展示 agent 造成的文件修改，长 diff 写 artifact。
- test view 能展示最近命令、exit code、失败摘要，并支持 rerun。
- approval UI 支持 approve once、deny、approve similar prefix，且决策可审计。
- cancel 后 provider request、shell process、approval wait 和 store 状态都被正确处理。
- 重启后能打开历史 session，并能恢复未完成或中断 session。
- provider state 缺失后能通过 transcript replay 继续。
- 大 terminal output 不直接塞满 transcript 或模型上下文。
- ContextManager 能记录 budget 诊断，并保留 unresolved tool/error/approval。
- Plan mode 是只读 permission mode，能生成 plan artifact，并通过 plan approval 才进入执行。
- replay tests 不调用真实 provider 也能验证 run loop、resume 和 UI event rendering。

## 10. 非目标

Phase 1 不做：

- 自动 skill activation。
- MCP。
- 多 provider fallback。
- 长期 memory。
- browser verification。
- 完整 runtime compaction 和跨长任务 checkpoint restore。
- subagent、fork mode、独立 verifier 或 agent team。
- provider/model picker、usage ledger 和成本优化，这些属于 Phase 4。
- scheduler、automation、本地 HTTP API 和插件系统。
- 企业策略管理。
- 完整前端/桌面 UI。TUI 只要求能支撑本地 coding workflow。

## 11. 已知限制

- Plan mode 的 P1 版本只做单 agent 只读规划、plan artifact、用户批准和轻量对照；不做独立 verifier。
- checkpoint 在 P1 是恢复和诊断的占位能力，不提供任意时间点回滚。
- `test.rerun` 第一版可以复用最近测试类 `shell.run` 命令，不需要识别所有测试框架。
- Git 不可用的 workspace 可以使用 `file.patch` fallback，但 P1 默认按 Git workspace 验收。
- token 预算先允许估算，精确 tokenizer 和 provider-specific cost 统计留到 Phase 4。

## 12. 退出条件

Phase 1 结束前必须完成 phase gate：

- 当前产品界面可启动。
- 手工验收任务通过。
- 自动测试和 replay tests 通过。
- session store 可查看历史。
- 崩溃、取消、拒绝 approval、provider state 缺失都有明确行为。
- P1 文档、总开发计划和路线图状态同步。
- 已知限制记录清楚。

Phase 1 结束后，Mineco 应该可以作为主力本地 coding agent 使用。后续阶段主要扩展 skills、providers、MCP、长任务和自动化，而不是补 Phase 1 的可靠性缺口。

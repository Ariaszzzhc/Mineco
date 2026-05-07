# 整体分析

来源：

- [在线阅读站点](https://lintsinghua.github.io/)
- [GitHub 仓库](https://github.com/lintsinghua/claude-code-book)

## 总体判断

《御舆：解码 Agent Harness》对 Electrolyte 最有价值的地方，不是提供一个可以直接照搬的设计，而是提供了一套用来检查 agent runtime 成熟度的细节视角。

Electrolyte 现有文档的一级方向基本正确：

- 明确不是 chat API wrapper。
- 已经有 Agent Core、Provider Adapter、Tool Runtime、State Layer 分层。
- 已经有供应商中立的 Agent Runtime Protocol。
- 已经规划 RuntimeEvent、ToolRuntime、Approval、Context、Compaction、Replay、Skills、MCP、Automation。
- Phase 0-6 的顺序与自建 Harness 的递进路线大体一致。

因此不需要推翻现有设计。真正需要吸收的是若干“二级细节”和“边界条件”。

## 最值得吸收的内容

### 1. 权限与配置的信任来源模型

现有文档有 approval 和安全策略，但配置来源的信任半径不够清楚。第 04、05 章说明：权限和配置要一起设计。

建议后续补充：

- config source priority。
- workspace/project 配置不能扩大危险权限。
- deny 优先于 allow。
- permission decision 记录来源、作用域、是否持久化。
- policy 可锁定 hooks、MCP、plugins、skills 等能力面。

### 2. ToolDefinition 的执行元数据

现有 ToolSpec 已有 schema 和 policy，但第 03、13 章提示工具需要更完整的 runtime 元数据。

建议后续补充：

- readOnly。
- destructive。
- concurrencySafe。
- progress event schema。
- output inline limit。
- artifact strategy。
- result ordering rule。

这些字段应尽早进入协议或内部 ToolDefinition，否则后续 REPL/TUI、parallel tools、audit log 和 artifact viewer 会各自发明一套规则。

### 3. Context budget 与 compaction failure breaker

现有文档已有 context 和 compaction，但第 07 章提示需要预算公式和失败保护。

建议后续补充：

- effective context window。
- reserved output tokens。
- warning/compact/blocking thresholds。
- compaction failure count。
- circuit breaker terminal reason。

### 4. Plan mode 作为 runtime permission mode

第 14 章是对 Electrolyte 当前文档补充价值最大的一章。早期判断是：Electrolyte 有设计先行和 reviewability，但还没有把 Plan mode 明确为 runtime capability。该判断已被后续文档采纳：最小 Plan mode 现在是 Phase 1 gate，而不是待定候选能力。

已纳入 Phase 1 的最小能力：

- read-only plan mode。
- plan artifact。
- plan approval。
- restore previous permission mode。

Phase 5+ 只扩展：

- complex plan recovery。
- verifier 对照计划检查实现。

### 5. 多智能体的角色边界

第 09、10 章说明多智能体最重要的是边界，不是并行数量。

建议 Phase 5 记录：

- explorer/planner 默认只读。
- worker 有明确写入范围。
- verifier 对抗性只读。
- coordinator 只编排不执行。
- worker 必须可停止、可恢复、可审计。

## 已经覆盖得比较好的内容

这些点不需要因为本书再新增文档，只需要实现时保持：

- Agent Harness 不是简单 API wrapper。
- Agent Core 与 Provider Adapter 解耦。
- Tool Runtime 独立负责工具执行和安全。
- RuntimeEvent stream 是产品界面的基础。
- Session store、event log、replay 是长期能力。
- Skills、MCP、plugins、connectors 分阶段引入。
- Phase 0 保持 REPL first，不提前做完整 TUI。

## 不建议照搬的内容

- Bun、React/Ink、Zod v4 的技术栈选择。Electrolyte 应保持当前 Node.js 25-first 基线：pnpm workspace、Vitest、Kysely、Effect、Zod 和 `node:sqlite`。
- Claude Code 的具体内置工具清单。Electrolyte 应按自己的阶段目标定义工具。
- 过早实现 Fork mode、Coordinator、prompt hook、agent hook、classifier approval。
- 过早创建大型功能标志表和术语表。
- 将 Plan mode 降级为普通 prompt 或 slash command。

## 建议的文档后续动作

优先级从高到低：

- [x] 1. 更新 [Agent Runtime 协议](../../protocol/agent-runtime-protocol.md)：补 TerminalReason、ToolDefinition execution metadata、ContextBudget。已完成，2026-05-07。
- [x] 2. 更新 [AI Agent Runtime 设计](../../architecture/agent-runtime-design.md)：补 config source/trust model，并将最小 Plan mode 明确为 Phase 1 必做 runtime permission mode。已完成，2026-05-07。
- [x] 3. 更新 [Phase 0 本地 Agent 执行架构](../../roadmap/phase-0-local-agent-execution.md)：强调 Phase 0 不能绕过 RuntimeEvent、ToolRuntime、Store 边界；补最小 terminal reasons。已完成，2026-05-07。
- [x] 4. 更新 [Phase 5 Long-Running Coding Agent](../../roadmap/phase-5-long-running-coding-agent.md)：补 explorer/planner/worker/verifier/coordinator 的角色边界。已完成，2026-05-07。
- [ ] 5. 等实现开始后再新增 tool registry 文档，不要现在创建空清单。

## 最终结论

这本书对 Electrolyte 的价值是“校准细节”，不是“替换设计”。

Electrolyte 当前文档已经抓住了长期架构方向；接下来应该吸收书中对权限管线、配置来源、工具元数据、上下文预算、Plan mode 和多智能体边界的细节经验。其余内容应保持延后，避免在 Phase 0 前把系统复杂度拉满。

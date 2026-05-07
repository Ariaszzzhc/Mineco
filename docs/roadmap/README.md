# 路线图索引

本目录保存 Electrolyte 的阶段计划。阶段文档定义“什么时候做什么”，不承载长期架构或协议契约。

## 阅读顺序

1. [开发计划](development-plan.md) - Phase 0-6 总览、阶段原则和跨阶段不变量。
2. [Phase 0 本地 Agent 执行架构](phase-0-local-agent-execution.md) - 第一条可实现切片，内容最详细。
3. Phase 1-6 文档 - 后续阶段范围、非目标、验收标准和退出条件。

## 阶段状态

| 阶段 | 文档 | 状态 |
| --- | --- | --- |
| Phase 0 | [本地 Agent 执行架构](phase-0-local-agent-execution.md) | 详细规划 |
| Phase 1 | [可靠性与可审阅性](phase-1-reliability-and-reviewability.md) | 详细规划 |
| Phase 2 | [MCP and Tool Ecosystem](phase-2-mcp-and-tool-ecosystem.md) | 详细规划 |
| Phase 3 | [Agent Skills](phase-3-agent-skills.md) | 详细规划 |
| Phase 4 | [Provider Abstraction](phase-4-provider-abstraction.md) | 规划占位 |
| Phase 5 | [Long-Running Coding Agent](phase-5-long-running-coding-agent.md) | 规划占位 |
| Phase 6 | [Automation and Extensibility](phase-6-automation-and-extensibility.md) | 规划占位 |

## 维护边界

- `development-plan.md` 保留阶段总览、阶段原则和跨阶段不变量。
- `phase-*.md` 保存单阶段范围、非目标、架构变化、测试计划、验收标准和退出条件。
- 如果阶段范围与长期设计冲突，先更新架构或协议文档，再同步本目录。
- 不在路线图中记录临时 issue、个人任务清单或实现日志。

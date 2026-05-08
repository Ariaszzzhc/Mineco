# 附录分析

来源：[目录与附录入口](https://github.com/lintsinghua/claude-code-book#appendix--%E5%8F%82%E8%80%83%E8%B5%84%E6%96%99%E9%80%9F%E6%9F%A5)

## 附录内容定位

原书附录包括：

- A：源码导航地图。
- B：工具完整清单。
- C：功能标志速查表。
- D：术语表。

这些附录的价值不在于具体条目本身，而在于大型 Agent Harness 需要“索引层”来维持可维护性。架构文档写原则，附录维护事实清单。

## 对照 Mineco 现有文档

已覆盖：

- Mineco 已有 [文档索引](../../README.md)、[路线图索引](../../roadmap/README.md) 和 [文档审计](../../documentation-audit.md)。
- 架构、协议、路线图、流程的源真相归属已经比较清楚。

部分覆盖：

- 还没有工具清单文档。Phase 0 工具散落在 roadmap 和 protocol 中。
- 还没有功能标志清单。当前阶段还不急，但进入插件、MCP、automation 后会需要。
- 还没有术语表。ARP、AgentSession、AgentRun、RuntimeEvent、ToolRuntime、ProviderState 等术语已有，但没有集中索引。

## 值得参考

附录提示 Mineco 后续应维护三类事实表：

- Tool registry 文档：每个工具的名称、来源、权限、并发属性、输出策略。
- Feature flag 文档：每个 flag 的阶段、默认值、影响面、是否可由配置开启。
- Glossary：把 protocol 和 architecture 的术语统一。

## 暂不采纳

当前不需要立刻创建大型术语表或功能标志表。项目仍处于设计阶段，过早维护清单会产生文档噪音。

## 后续建议

Phase 0 实现开始后，可以先创建最小 tool registry 文档。Phase 2 后补 MCP registry；Phase 3 后补 skill registry；Phase 6 前再补 feature flag 表。

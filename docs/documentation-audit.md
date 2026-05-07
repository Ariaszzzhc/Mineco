# 文档审计

日期：2026-05-07

## 范围

已检查当前所有项目文档：

- `README.md`
- `docs/README.md`
- `docs/architecture/agent-runtime-design.md`
- `docs/protocol/agent-runtime-protocol.md`
- `docs/roadmap/README.md`
- `docs/roadmap/development-plan.md`
- `docs/roadmap/phase-0-local-agent-execution.md`
- `docs/roadmap/phase-1-reliability-and-reviewability.md`
- `docs/roadmap/phase-2-mcp-and-tool-ecosystem.md`
- `docs/roadmap/phase-3-agent-skills.md`
- `docs/roadmap/phase-4-provider-abstraction.md`
- `docs/roadmap/phase-5-long-running-coding-agent.md`
- `docs/roadmap/phase-6-automation-and-extensibility.md`
- `docs/process/development-workflow-and-standards.md`
- `docs/documentation-audit.md`
- `docs/research/openai-symphony-orchestration.md`
- `docs/research/openai-codex-agent-loop.md`
- `docs/research/openai-harness-engineering-codex.md`
- `docs/research/mcp-specification-2025-11-25.md`
- `docs/research/agent-skills-specification.md`
- `docs/research/claude-code-book/README.md`
- `docs/research/claude-code-book/ch01.md` 到 `ch15.md`
- `docs/research/claude-code-book/appendix.md`
- `docs/research/claude-code-book/overall-analysis.md`

## 检查项

- 文档入口和层级。
- 所有 Markdown 文件中的相对链接。
- 标题和代码块结构。
- 架构、协议、路线图和流程文档之间的阶段范围一致性。
- 架构、协议、路线图和流程决策的归属边界。

## 发现

- 文档已经组织在稳定的 `docs/` 层级下，并且 `README.md` 与 `docs/README.md` 提供了清晰入口。
- 已新增 `docs/roadmap/README.md`，把阶段文档入口和状态从总索引中分离出来，避免 `docs/README.md` 继续承载过多路线图细节。
- 未发现损坏的相对 Markdown 链接。
- 未发现未闭合的 fenced code block。
- 未发现过期的重复文档。
- 架构、路线图、Phase 0 和流程文档中的阶段顺序一致。
- Phase 1、Phase 2 和 Phase 3 已更新为详细规划；Phase 4、Phase 5、Phase 6 文档当前仍是规划占位，结构一致，适合在进入对应阶段前逐步细化。
- 已将开发顺序调整为 Phase 2 MCP and Tool Ecosystem、Phase 3 Agent Skills、Phase 4 Provider Abstraction，并同步路线图索引状态。
- 已修复一个阶段范围不一致：协议实现计划曾把 Anthropic adapter 工作列入第一条实现切片，而路线图将 Phase 0 限定为一个真实 provider 加 MockProvider，并把更广泛的 provider 抽象移动到 Phase 4。
- 已更新本审计记录，因为之前的范围遗漏了 `docs/roadmap/development-plan.md`。
- 已再次更新本审计记录，因为之前的范围遗漏了 `docs/roadmap/phase-1-*` 到 `docs/roadmap/phase-6-*`。
- 已新增 `docs/research/claude-code-book/`，用于保存《御舆：解码 Agent Harness》的逐章外部资料分析和整体参考价值判断；该目录不作为架构、协议或路线图源真相。
- 已将 Phase 2 MCP and Tool Ecosystem 从规划占位更新为详细规划，并同步路线图索引状态。
- 已新增 `docs/research/mcp-specification-2025-11-25.md`，把 MCP 官方规范原文链接、要点摘要和 SDK 观察从 P2 实现决策中分离出来。
- 已新增 Agent Skills 官方 specification 的资料记录，并把关键格式约束同步到 Phase 3 Agent Skills 详细规划。
- 已新增 OpenAI Codex harness engineering 经验记录，作为 agent-first 工程、仓库记录系统、agent-readable feedback loop、机械约束和长期垃圾回收策略的外部 research 参考。
- 已新增 OpenAI Codex agent loop 机制记录，作为 Responses API 输入构造、provider event 映射、prompt caching、transcript replay 和 compaction 设计的外部 research 参考。
- 已新增 OpenAI Symphony agent orchestration 规范记录，作为 issue-driven automation、per-task workspace、bounded concurrency、reconciliation、Codex App Server 和 workflow contract 设计的外部 research 参考。

## 归属模型

- 架构决策归属 `docs/architecture/`。
- 协议契约归属 `docs/protocol/`。
- 阶段范围、状态和验收标准归属 `docs/roadmap/`。
- 工程工作流以及 review/release 标准归属 `docs/process/`。
- 审计历史归属 `docs/documentation-audit.md`。
- 外部资料分析归属 `docs/research/`。

## 建议的下一步清理

- 实现开始后，只有当 package 有可运行命令或 public API 时，才添加 package 级 `README.md`。
- 阶段 gate 决策开始根据实现反馈变化后，添加 changelog。
- 不要把 issue/task 细节写进长期设计文档，除非它们已经成为稳定范围或验收标准。

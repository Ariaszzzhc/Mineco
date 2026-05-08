# 文档索引

本目录是 Mineco 设计、协议、路线图和开发流程文档的源真相。

命名约定：项目名是 Mineco；Electrolyte 仅作为 0.3 版本代号，不作为项目名、CLI 名或 workspace 目录名使用。

## 从这里开始

1. [AI Agent Runtime 设计](architecture/agent-runtime-design.md) - 长期 runtime 架构、产品表面、provider/tool/skill 边界和关键设计决策。
2. [Technology Stack 使用说明](architecture/technology-stack.md) - Node.js、Turborepo、Biome、Kysely、Effect、LogTape、SQLite、Vitest 等技术栈的项目内使用规则。
3. [Agent Runtime 协议](protocol/agent-runtime-protocol.md) - agent runtime 与模型供应商之间的供应商中立协议。
4. [路线图索引](roadmap/README.md) - Phase 0-6 阶段文档入口、状态和维护边界。
5. [Phase 0 本地 Agent 执行架构](roadmap/phase-0-local-agent-execution.md) - 第一条可用 agent 执行切片和验收标准。
6. [开发工作流和规范](process/development-workflow-and-standards.md) - 工程规则、阶段 gate、review 标准和文档规则。

## 结构

- `architecture/` - 长期系统架构和设计决策。
- `protocol/` - 供应商中立协议契约和 schema 级设计。
- `roadmap/` - 阶段计划、限定范围的里程碑和验收标准。
- `process/` - 开发工作流、规范、review 策略和阶段 gate。
- `research/` - 外部资料分析笔记，不作为架构或协议源真相。

## 源真相归属

- 系统边界、长期组件职责和关键设计决策归属 [AI Agent Runtime 设计](architecture/agent-runtime-design.md)。
- 技术栈使用规则、库边界和项目内 adapter 策略归属 [Technology Stack 使用说明](architecture/technology-stack.md)。
- runtime/provider schema、RuntimeEvent、item、tool、approval、artifact DTO 和 adapter 契约归属 [Agent Runtime 协议](protocol/agent-runtime-protocol.md)。
- 阶段目标、范围、非目标、验收标准和退出条件归属 [roadmap/](roadmap/README.md)。
- 工程节奏、编码规范、测试要求、review 和 release gate 归属 [开发工作流和规范](process/development-workflow-and-standards.md)。
- 文档盘点、清理结论和后续整理建议归属 [文档审计](documentation-audit.md)。
- 外部资料学习、逐章分析和参考价值判断归属 `research/`。

## 阶段文档

- [开发计划](roadmap/development-plan.md)
- [Phase 0 本地 Agent 执行架构](roadmap/phase-0-local-agent-execution.md)
- [Phase 1 可靠性与可审阅性](roadmap/phase-1-reliability-and-reviewability.md)
- [Phase 2 MCP and Tool Ecosystem](roadmap/phase-2-mcp-and-tool-ecosystem.md)
- [Phase 3 Agent Skills](roadmap/phase-3-agent-skills.md)
- [Phase 4 Provider Abstraction](roadmap/phase-4-provider-abstraction.md)
- [Phase 5 Long-Running Coding Agent](roadmap/phase-5-long-running-coding-agent.md)
- [Phase 6 Automation and Extensibility](roadmap/phase-6-automation-and-extensibility.md)

## 维护规则

- public runtime/provider schema、artifact schema 或 SDK-facing DTO 变化时，更新协议文档。
- 边界或长期设计决策变化时，更新架构文档。
- 阶段范围、验收标准或非目标变化时，更新路线图文档。
- 工程工作流、测试、review 或发布 gate 变化时，更新流程文档。
- 保持跨文档链接相对于这个 `docs/` 目录布局。

## 审计

- [文档审计](documentation-audit.md) 记录当前文档盘点、结构调整和剩余清理建议。

## 外部资料分析

- [OpenAI Symphony Agent Orchestration 规范记录](research/openai-symphony-orchestration.md)
- [OpenAI Codex Agent Loop 机制记录](research/openai-codex-agent-loop.md)
- [OpenAI Harness Engineering Codex 经验记录](research/openai-harness-engineering-codex.md)
- [MCP Specification 2025-11-25 资料记录](research/mcp-specification-2025-11-25.md)
- [Agent Skills Specification 资料记录](research/agent-skills-specification.md)
- [《御舆：解码 Agent Harness》逐章分析](research/claude-code-book/README.md)

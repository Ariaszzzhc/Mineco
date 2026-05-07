# OpenAI Harness Engineering Codex 经验记录

日期：2026-05-07

来源：[工程技术：在智能体优先的世界中利用 Codex](https://openai.com/zh-Hans-CN/index/harness-engineering/)

发表日期：2026-02-11

作者：Ryan Lopopolo

归属：外部工程经验资料记录。本文不替代 `docs/architecture/agent-runtime-design.md`、`docs/process/development-workflow-and-standards.md` 或 `docs/roadmap/` 的源真相；它用于记录 OpenAI 在 agent-first 软件工程实验中的实践经验，并提取对 Electrolyte agent runtime、文档系统、可靠性、reviewability 和长任务能力的参考价值。

## 核心摘要

- OpenAI 团队在五个月实验中构建并交付一个内部 beta 产品，约束条件是代码、测试、CI、文档、可观测性和内部工具都由 Codex 编写。
- 团队从 2025 年 8 月下旬的空仓库开始，由小团队驱动 Codex 生成初始架构、仓库结构、CI、格式化、包管理器和初始 `AGENTS.md`。
- 五个月后仓库约一百万行代码，期间约 1,500 个 Pull Request 被打开和合并。文章强调这不是单纯追求输出量，而是用于真实内部用户和外部 alpha 测试者的产品。
- 人类工程师的角色从直接写代码转向设计环境、拆解目标、定义约束、构建工具和反馈回路，让智能体能够独立完成更多工作。
- 随着代码吞吐量上升，瓶颈转向人工 QA 和可验证性。团队把 UI、日志、指标和 trace 变成 Codex 可以直接读取、查询和推理的对象。
- 文章把仓库作为记录系统：短 `AGENTS.md` 只作为地图和目录，深层知识放在结构化 `docs/` 中，并通过索引、验证状态、交叉链接和文档维护流程保持可发现。
- 对智能体而言，不在运行上下文或仓库本地可发现的知识等同于不存在。Google Docs、聊天记录和隐性人类知识需要被转化为仓库中的 Markdown、schema、计划或可执行规则。
- 文章强调 agent-readable 架构：倾向稳定、可组合、训练集中常见、API 清晰的依赖和抽象；必要时宁可实现小而可观测、可测试的内部工具。
- 保持一致性不能只依赖文档。团队用自定义 lint、结构测试、命名规则、文件大小限制、结构化日志规则和架构边界把品味与约束编码进系统。
- 在高吞吐 agent 工作流里，传统合并门会改变。短生命周期 PR、低成本纠错、自动化 review 和后续修复比长时间阻塞更重要，但这依赖强测试、审计和恢复能力。
- 完全自主的 agent 会复制现有模式，也会复制坏模式。团队把主观的工程原则转成机械规则，并用定期后台任务持续扫描漂移、发起重构和清理技术债。
- 文章结论是软件工程仍然需要纪律，但纪律更多体现在支撑结构、反馈回路、控制系统和可维护约束上，而不是每一行人工代码上。

## 对 Electrolyte 的参考价值

- `docs/` 作为源真相的方向是正确的。Electrolyte 应继续保持 `docs/README.md` 作为地图，架构、协议、路线图、流程和 research 各有归属，而不是把所有上下文塞进单个 agent 指令文件。
- Phase 1 的 reviewability 不应只服务人类 UI，也应服务未来 agent 自检。diff、test result、approval log、artifact、terminal output 和 replay event 都要有结构化摘要，便于模型读取和复核。
- Phase 1 的 Plan mode、artifact、replay 和 approval audit 是 agent-first 工作流的基础设施，不是界面增强项。它们决定后续能否把更多 review 和修复工作交给 agent。
- Phase 2 MCP 和 Phase 3 Skills 要继续坚持权限边界：外部 tool、skill 或 prompt 只能声明能力需求，不能绕过 ToolRuntime、RuntimePolicy、approval 和 sandbox。
- Phase 5 长任务应把 browser verification、日志查询、metrics/tracing、checkpoint 和 compaction 视为 agent 可读反馈回路，而不仅是诊断功能。
- 技术栈选择要继续偏向可读、稳定、可测试的 boring technology。对 agent runtime 来说，透明的内部 adapter、schema、测试和 instrumentation 比黑盒依赖更有长期价值。
- 架构边界和品味约束应尽早转成机械检查：dependency direction、schema boundary parsing、structured logging、tool risk metadata、artifact size policy、file size limit 和 naming rules 都适合作为 lint 或结构测试。
- 文档维护需要自动化。后续可以增加 doc freshness、broken link、phase status、cross-link、source-truth ownership 和 stale research 的检查，而不是靠人工记忆。
- 长期应把 review comment、bug、用户反馈和重复错误转成文档更新、lint 规则、test fixture 或 tool behavior，避免同一类问题反复依赖 prompt 纠正。

## 不应直接照搬的部分

- “不人工写代码”是 OpenAI 团队刻意设置的实验约束，不应成为 Electrolyte 的默认工程规则。Electrolyte 的目标是构建可靠 agent runtime，而不是禁止人工修改。
- 文章中的端到端自主流程依赖高度投资的内部工具、可观测性栈、review loop 和仓库约束。Electrolyte 不应在 Phase 0-1 假设这种能力已经自然成立。
- 高吞吐合并策略只有在测试、replay、artifact、approval、rollback 和审计足够成熟后才成立。早期阶段仍应以可审阅、可恢复和范围清晰为优先级。
- 自定义 lint 和结构测试应聚焦真正稳定的工程不变量。过早把尚未验证的偏好编码成硬规则，会增加实现和迁移成本。

## 可转化为后续工作项的方向

- 为 `docs/` 增加轻量文档 linter：检查相对链接、源真相归属、阶段状态、必需章节和 research 来源字段。
- 在 Phase 1 artifacts 中统一 model-visible summary 字段，使 terminal log、diff、plan、test report 和 replay trace 都能被 agent 读取。
- 在 Phase 1 或 Phase 2 增加结构测试，验证 ToolRuntime 是唯一执行边界，MCP、skill、plugin 不能直接执行文件、shell 或 provider 调用。
- 在 Phase 5 设计中明确 observability loop：browser snapshot、DOM state、screenshots、runtime metrics、tool timings、logs 和 traces 进入 artifact store，并暴露可查询摘要。
- 规划定期 doc-gardening 或 tech-debt-gardening agent，但只在 replay、approval、sandbox 和 diff review 稳定后启用。

## 仍需实现时确认

- Electrolyte 第一批文档 lint 应放在 Phase 1 gate，还是等 Phase 2/3 文档和 skill/MCP 格式稳定后再加入。
- 是否为 architecture、protocol、roadmap、process 和 research 定义最小 frontmatter 或 metadata，以便自动检查 freshness 和 ownership。
- Phase 5 是否优先实现 browser verification，还是优先实现 logs/metrics/traces 的本地可观测性查询能力。
- 哪些工程品味适合先转成硬规则，哪些应保留为 review guideline，避免过早限制实现空间。

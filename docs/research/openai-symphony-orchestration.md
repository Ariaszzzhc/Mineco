# OpenAI Symphony Agent Orchestration 规范记录

日期：2026-05-07

来源：[Codex 编排的开源规范：Symphony](https://openai.com/zh-Hans-CN/index/open-source-codex-orchestration-symphony/)

发表日期：2026-04-27

作者：Alex Kotliarskyi、Victor Zhu、Zach Brock

归属：外部编排规范资料记录。本文不替代 `docs/architecture/agent-runtime-design.md`、`docs/roadmap/phase-5-long-running-coding-agent.md` 或 `docs/roadmap/phase-6-automation-and-extensibility.md` 的源真相；它用于记录 OpenAI Symphony 对 issue-driven agent orchestration、长期运行任务、独立工作区、调度/reconciliation、Codex App Server 和 workflow prompt 契约的参考价值。

## 核心摘要

- Symphony 的目标是解决交互式 coding agent 的上下文切换瓶颈：人类工程师同时管理多个 Codex 会话时，注意力成为系统瓶颈。
- Symphony 把 Linear 这类项目管理看板变成 coding agents 的控制平面：每个活跃任务都有一个专属 agent workspace，agent 持续运行，人类主要审阅结果。
- OpenAI 团队观察到这种工作方式让部分团队 landed PR 数在前三周提升约 500%，但文章同时强调更深层变化是团队对工作经济性的认知变化：试验、探索和原型的启动成本显著降低。
- 工作单元从 session/PR 上移到 issue/task。一个 issue 可以产生多个 PR，也可以只产出调研、分析或计划。
- Symphony 支持把大型功能或迁移拆成 task DAG。agent 只处理未被 blocker 阻塞的任务，使并行执行自然展开。
- Agent 可以在实现或 review 中发现超出当前任务范围的问题，并创建后续 issue，供人类评估和排期。
- 这种模式降低了模糊工作的启动成本，但也带来新问题：失去交互式中途 steering 后，系统必须依赖更好的 guardrails、skills、E2E tests、Chrome DevTools 驱动和清晰文档来提升首次执行质量。
- 文章不建议把 agent 当作刚性状态机节点。更有效的方式是给 agent 目标、工具和上下文，让它处理 PR、CI、review feedback、报告和后续任务。
- Symphony 本质上是一份语言无关的 `SPEC.md`：定义一个长期运行服务，持续读取 issue tracker，为每个 issue 创建独立 workspace，并在其中运行 coding agent session。
- 规范把系统拆成 Workflow Loader、Config Layer、Issue Tracker Client、Orchestrator、Workspace Manager、Agent Runner、Status Surface 和 Logging。
- 规范目标包括固定 cadence 轮询、bounded concurrency、单一权威 orchestrator state、每 issue 确定性 workspace、状态变化时停止不再 eligible 的 run、指数退避、repo-owned `WORKFLOW.md`、结构化日志和无持久数据库的 restart recovery。
- `WORKFLOW.md` 是 repo-owned contract，包含 YAML front matter 和 prompt body，用于版本化 workflow policy、runtime settings、hooks、tracker config 和 agent handoff 规则。
- Workspace 以 sanitized issue identifier 生成目录名，同一 issue 的 workspace 会跨 run 复用；成功 run 不自动删除 workspace。
- Polling/reconciliation 是核心机制：每个 tick 先 reconcile active runs，再获取候选 issue、过滤 blocked/claimed/terminal issue、应用优先级排序和并发限制、dispatch 新 run、处理 retry/backoff 和状态通知。
- Agent Runner 通过 coding agent app-server 协议启动 session。文章提到 Codex App Server 的 headless mode，可通过 JSON-RPC API 程序化启动 thread、响应 turns，并比 CLI/tmux 更适合编排。
- 规范刻意把 tracker writes 排除在 orchestrator 一等 API 之外。状态迁移、评论、PR link 通常由 coding agent 通过 workflow prompt 和可用工具完成，orchestrator 保持 scheduler/runner/tracker reader 边界。
- Observability 要求 operator 能看到 startup、validation、dispatch、retry 和 failure；可选 snapshot 包括 running sessions、retry queue、token totals、runtime seconds 和 rate-limit payload。
- OpenAI 将 Symphony 作为参考实现而非计划长期维护的独立产品，意图是让团队基于 spec 和自身环境构建定制版本。

## 对 Electrolyte 的参考价值

- Phase 6 的 scheduler/automation 不应从通用分布式工作流引擎开始。Symphony 证明一个受限、issue-driven、workspace-isolated 的 orchestrator 更符合 coding agent 的早期落地形态。
- Electrolyte 的 automation 层应保持清晰边界：scheduler 负责读取任务、判断 eligibility、创建 workspace、启动/停止 agent run、记录状态；任务评论、PR 链接和状态迁移应优先通过 agent tools 和 workflow policy 完成。
- Phase 5 的 long-running coding agent 与 Phase 6 的 automation 需要共享 session/run/worker 状态模型。Symphony 的 `RunAttempt`、`LiveSession`、retry entry、terminal reason、stall detection 和 token totals 可作为后续数据模型参考。
- 每任务独立 workspace 是安全和可审阅性的关键。Electrolyte 后续自动化应避免多个 issue 共享可写目录，并明确 workspace lifecycle、reuse、cleanup 和 hook failure semantics。
- `WORKFLOW.md` 与 Electrolyte 的 workspace agent config、skills 和 process docs 有重叠。后续可考虑把 workflow policy 作为 repo-owned automation contract，但必须经过 trust model、permission merge 和 approval policy，而不是直接当成高信任 prompt。
- Orchestrator state 应是机器可审计的结构，而不是 dashboard 字符串。TUI/dashboard 只能消费 snapshot 和 logs，不能成为调度正确性的依赖。
- Reconciliation 比单次 dispatch 更重要。自动化系统必须处理 issue 状态变化、blocker 变化、run stall、agent crash、host capacity、retry backoff、workspace cleanup 和 restart recovery。
- 文章中“给目标而非刚性 transition”的经验适合 Electrolyte agent design：runtime 应提供约束、工具和审计，避免把 agent 压成过窄的步骤执行器。
- Codex App Server 对应 Electrolyte 未来本地 API/worker 模式：需要可程序化启动 session、推送 turns、读取 events、取消 run、读取 artifacts 和汇总 usage，而不是只能驱动交互式 CLI。
- Dynamic tool calls 用于避免把 Linear token 暴露给 subagents 的例子，支持 Electrolyte 的设计方向：外部凭据应留在受控 tool boundary 内，agent/container 只看到受限 tool capability。

## 不应直接照搬的部分

- Symphony 当前以 Linear 为主，并不等于 Electrolyte 应把 Linear 做成核心依赖。Electrolyte 应抽象 tracker adapter，Linear/GitHub Issues/local tasks 只是具体实现。
- “无持久数据库 restart recovery”适合轻量参考实现，不一定适合 Electrolyte。Electrolyte 已规划 SQLite session store，自动化层应利用可审计 store，而不是为了贴合 spec 放弃 durable state。
- `WORKFLOW.md` 不应自动扩大权限。它可以描述 workflow、prompt、状态和 hooks，但 hook execution、tracker writes、shell、network、browser 和 PR 操作仍必须走 RuntimePolicy 与 approval。
- 高吞吐自动化不适合早期默认开启。没有 Phase 1 reviewability、artifacts、approval audit、replay 和 Phase 5 recovery 能力时，自动接管 issue tracker 会放大错误。
- Agent 创建后续 issue 的能力需要治理。它应有 scope、label、rate limit、duplicate detection 和 human review，不能让 agent 无边界扩张任务队列。

## 可转化为后续工作项的方向

- 在 Phase 6 设计中增加 `AutomationOrchestrator` 边界：tracker reader、eligibility resolver、workspace manager、agent runner、retry/reconciliation、snapshot/logging。
- 设计 tracker-neutral issue model：`id`、`identifier`、`title`、`description`、`priority`、`state`、`labels`、`blocked_by`、`url`、`created_at`、`updated_at`。
- 设计 per-task workspace lifecycle：sanitized workspace key、absolute path resolution、reuse policy、cleanup policy、hook policy 和 safe deletion invariant。
- 设计 automation run state machine：pending、claimed、preparing_workspace、starting_agent、streaming_run、finishing、succeeded、failed、timed_out、stalled、cancelled_by_reconciliation。
- 在 runtime SDK 中预留 headless/app-server style API：create session、start turn、stream events、cancel run、read artifacts、read usage、snapshot active runs。
- 在 workflow contract 中区分 repo-owned policy 与 user/local secret config：`WORKFLOW.md` 可以版本化 prompt 和 workflow rules，secrets 和 dangerous approvals 只能来自 user/local/policy 层。
- 为 automation observability 规划结构化日志字段：issue id、issue identifier、session id、run attempt、workspace path、terminal reason、retry attempt、token totals、duration 和 rate-limit snapshot。
- 在 Phase 5/6 之前加入人工 review packet 概念：diff、tests、artifact、视频/截图、summary、known risks 和 follow-up issues 统一作为任务完成输出。

## 仍需实现时确认

- Electrolyte 的第一版 automation 应优先支持 GitHub Issues、Linear、本地 Markdown task queue，还是只做本地 scheduler。
- `WORKFLOW.md` 是否应该成为 Electrolyte repo-owned automation contract，还是沿用 `.agent/agent.json` / `.agent/policy.json` 并仅把 Symphony 作为参考。
- 自动化层是否允许 agent 创建后续 issue；如果允许，如何设置 labels、dedupe、rate limits 和 human approval。
- 每 issue workspace 应基于 git worktree、目录复制、容器 volume，还是由 workspace hooks 自定义。
- Headless API 应先作为本地 stdio/JSON-RPC app-server，还是直接进入 Phase 6 HTTP/SSE API。

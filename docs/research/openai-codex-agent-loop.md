# OpenAI Codex Agent Loop 机制记录

日期：2026-05-07

来源：[深入解析 Codex 智能体循环](https://openai.com/zh-Hans-CN/index/unrolling-the-codex-agent-loop/)

发表日期：2026-01-23

作者：Michael Bolin

归属：外部 runtime 机制资料记录。本文不替代 `docs/architecture/agent-runtime-design.md`、`docs/protocol/agent-runtime-protocol.md` 或 `docs/roadmap/` 的源真相；它用于记录 OpenAI Codex CLI agent loop、Responses API 输入构造、事件流、提示缓存和上下文压缩机制，对 Mineco provider adapter、runtime event、context manager 和 long-running agent 设计提供参考。

## 核心摘要

- Codex CLI 的核心是 agent loop：接收用户输入，构造模型提示，调用模型推理；模型要么返回最终助手消息，要么请求工具调用；工具结果再进入下一轮模型推理，直到模型交还控制权。
- 软件 agent 的输出不只是最终文字回复，也包括工具调用对本地环境造成的实际变更，例如创建、编辑或测试代码。每轮仍以一条助手消息结束，用于向用户说明状态。
- 一次用户对话轮次可能包含多次模型推理和工具调用迭代。后续用户消息会把之前的消息、工具调用和工具结果纳入新的输入，因此上下文窗口管理是 agent runtime 的核心职责。
- Codex CLI 使用 Responses API 做模型推理，端点可配置：ChatGPT 登录路径、OpenAI API、支持 Responses API 的本地或第三方实现、Azure 等托管服务都可以作为后端。
- Responses API 请求的关键字段包括 `instructions`、`tools` 和 `input`。`instructions` 来自用户配置或随 CLI 打包的模型特定基础指令；`tools` 包括 Codex 内置工具、Responses API 提供的工具和用户通过 MCP 暴露的工具。
- `input` 在用户消息前会插入若干上下文项：沙盒权限说明、可选 developer instructions、聚合后的用户/项目指令、skill metadata 和当前运行环境，例如 `cwd` 与 shell。
- 文章特别指出，Codex 的沙盒权限说明只约束 Codex 提供的 shell 工具；来自 MCP server 的工具不自动受 Codex shell sandbox 保护，需要各自负责执行防护。
- Responses API 返回 SSE 事件流。Codex 会把 provider 事件转换成内部事件对象，供 UI 流式展示，并把完成的输出项追加到后续请求的 `input` 中。
- 后续请求的提示应尽量让旧提示成为新提示的精确前缀，以利用 prompt caching。更改 tool 列表、模型、沙盒配置、审批模式或当前目录都可能造成缓存未命中。
- Codex 目前不使用 `previous_response_id`，以保持请求无状态，并更好支持零数据保留配置。这会带来 JSON 输入持续增长的问题，但提示缓存能缓解模型采样成本。
- 当沙盒、审批模式或当前目录在对话中发生变化时，Codex 倾向追加新的上下文消息，而不是修改旧消息，从而尽量维持历史输入前缀稳定。
- 为避免耗尽上下文窗口，Codex 会在 token 数超过阈值时压缩对话。早期依赖手动 `/compact`，后续使用 Responses API 的 compact 端点返回可替代旧 `input` 的压缩项目列表。

## 对 Mineco 的参考价值

- Provider adapter 应明确区分 provider event 和 runtime event。Responses SSE、reasoning summary、output item、tool call、completion 等属于 provider 事件；TUI/REPL 看到的稳定流应由 runtime 映射生成。
- `items` 继续作为 transcript source of truth 是正确方向。每次工具调用、工具结果、助手消息、summary 和 compaction 都应能从本地 transcript 重新构造 provider input，而不是依赖 provider-side state。
- Phase 0 的 OpenAI-compatible Chat Completions adapter 可以先落地，但 Phase 4 的 OpenAI Responses adapter 应保留 Responses 原生 item、reasoning summary、function call output、compact 和 encrypted provider state 的映射空间。
- Context assembly 应有稳定顺序：高优先级稳定 instructions、工具定义、权限上下文、项目指令、环境上下文、历史 transcript、当前用户输入。稳定部分越靠前，越有利于 provider prompt caching。
- ToolRegistry 的输出必须 deterministic。MCP tools、built-in tools 和 skill 暴露的工具列表需要稳定排序和稳定 schema，否则长对话会频繁破坏缓存前缀。
- 沙盒和权限说明不能只写进 prompt。文章中 MCP 工具不受 shell sandbox 约束的提醒，进一步支持 Mineco 的设计：所有内置、MCP、skill、plugin 工具都必须经过 ToolRuntime、RuntimePolicy、approval 和 audit。
- Approval mode、sandbox mode、cwd、active skills 和 tool visibility 变化时，runtime 应记录新 context item 或 event，而不是回写历史 transcript。这样既保留审计语义，也更接近 prompt caching 的最佳实践。
- Phase 1 的 replay 和 resume 应覆盖两条路径：从 runtime events 做 exact replay；从 transcript items 重新构造 provider input 做 provider-state-missing replay。
- Phase 5 的 compaction 不能只是摘要文本。它需要产出结构化 `SummaryItem` 或 `CompactionItem`，保留 tool state、open tasks、changed files、approval decisions、artifacts 和重要 constraints。
- ZDR 与 `previous_response_id` 的取舍说明了一个设计原则：provider-side continuation 是性能优化，不应成为恢复、隐私或可移植性的唯一基础。

## 不应直接照搬的部分

- Codex CLI 的 Responses API item shape 不应直接成为 Mineco 的 provider-neutral 协议。Mineco 仍应通过 ARP 抽象 provider 差异，只在 Responses adapter 内保留原生能力。
- Codex 不使用 `previous_response_id` 是针对其产品、ZDR 和实现生态的选择。Mineco 可以把 provider-side continuation 作为可选 capability，但不能让它替代本地 transcript replay。
- Responses compact 端点是 OpenAI-specific 能力。Mineco 的 ContextManager 应定义 provider-neutral compaction contract，再由不同 provider adapter 映射到 native compact、普通模型摘要或本地摘要策略。
- 文章展示的 prompt construction 是 Codex CLI 当前实现视角，不等同于所有模型供应商的最佳输入结构。Anthropic、Gemini、本地模型和 OpenAI Responses 都应由 adapter 做 capability-driven mapping。

## 可转化为后续工作项的方向

- 在 provider adapter contract 中明确 `ProviderEvent` 到 `RuntimeEvent` 的映射规则，并保留 provider raw event log 用于 debug 和 replay。
- 为 ToolRegistry 增加 deterministic serialization 测试，覆盖 built-in tools、MCP tools、skill tools 的排序、schema 和 visibility merge。
- 在 ContextManager 中记录 context assembly plan：每个 chunk 的来源、优先级、稳定性、token 估算和是否会影响 prompt cache。
- 在 Phase 1 replay fixture 中加入“工具调用后继续请求”的样例，验证 function call、tool output 和 assistant message 都能从 transcript 重新进入 provider input。
- 在 Phase 5 设计中补充 compaction item schema，至少包含摘要、未完成计划、最近工具状态、changed files、artifacts、approval decisions 和 provider-specific opaque payload。
- 在 approval/sandbox/cwd 变化时追加 context-change item，并测试它不会改写历史 item。

## 仍需实现时确认

- Mineco 是否在 Phase 4 支持 OpenAI Responses native item log，还是只保留 adapter 内部映射并把公共协议维持在 ARP item 上。
- Provider-side continuation，例如 `previous_response_id` 或等价能力，应作为默认关闭的性能优化，还是由 provider policy 和 privacy policy 决定。
- Prompt cache 诊断是否进入 Phase 4 usage ledger，记录 tool list 变化、model 变化、cwd 变化和 sandbox/approval 变化导致的潜在 cache miss。
- Phase 5 compaction 是先实现 provider-neutral summary item，还是同时接入 OpenAI Responses compact 端点作为专用 adapter 优化。

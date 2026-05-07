# Phase 5 Long-Running Coding Agent

版本：0.1 草案

状态：规划占位

相关文档：

- [开发计划](development-plan.md)
- [AI Agent Runtime 设计](../architecture/agent-runtime-design.md)

语言：中文

## 1. 阶段目标

支持更长、更复杂、可暂停和可恢复的 coding 任务。

## 2. 用户能力

- 让 agent 持续修复一组失败测试。
- 中途暂停、恢复、插话。
- 对前端任务使用 browser 验证。
- 查看 checkpoints 和 compacted summaries。
- 使用 code review mode。

## 3. 必做范围

Runtime：

- checkpoints。
- runtime compaction。
- resume after compaction。
- interruption handling。
- run retry。
- better failure recovery。

Tools：

- browser navigation/screenshot 基础工具。
- frontend verification path。
- focused code review mode。

Context：

- summary item generation。
- plan summary。
- tool trace summary。
- context budget diagnostics。

State：

- Memory store 第一版。
- metrics/tracing。

Product / Interface：

- checkpoint display。
- compaction indicator。
- browser artifact viewer。
- code review findings view。

## 4. 非目标

- 完整 agent team / swarm 产品化。
- 生产级 coordinator/worker 调度系统。
- 完整自动化 scheduler。
- 插件 registry。

## 5. 架构变化

Phase 5 的主线仍是单 agent 长任务能力：checkpoint、compaction、resume、interrupt、browser verification 和 code review mode。多智能体如果在本阶段出现，只能作为受限实验能力，并且必须满足以下边界。

角色边界：

- `explorer`：只读探索代码、日志、文档和工具结果；禁止写文件、运行 destructive shell、提交代码或修改 session 状态。
- `planner`：只读生成计划、风险和验证步骤；输出必须进入 plan artifact 或 summary item。
- `worker`：执行明确分配的实现任务；必须声明 writable scope、最大 turn 数、允许工具和停止条件。
- `verifier`：对照计划、diff、测试和 artifacts 做独立检查；默认只读，不能修复问题，除非被显式升级为 worker。
- `coordinator`：只负责分解任务、创建/停止 worker、读取 worker 状态、合并结果和向用户汇报；不直接修改文件，不直接执行 shell/write/browser 副作用工具。

生命周期边界：

- fork/subagent 只能继承父 session 的不可变快照，不能共享父 run 的可变内部状态。
- 每个 worker 必须有 owner、task description、write boundary、status、started_at、ended_at、terminal_reason。
- 用户 cancel 或 interrupt 父 run 时，取消信号必须传播到所有活动 worker。
- worker 事件需要投影回父 session event log，便于 UI、replay 和 audit。
- coordinator scratchpad 是 artifact 或 store 记录，不是隐藏内存。

这些约束先作为 Phase 5 设计边界；是否实现多智能体执行，取决于单 agent 长任务能力是否已经稳定。

## 6. 数据模型变化

Phase 5 至少需要补充：

- `checkpoints`：保存可恢复状态摘要和关联 artifact。
- `compaction_runs`：记录压缩触发原因、输入预算、输出 summary、失败原因。
- `run_metrics`：记录 token、成本、工具耗时、重试、恢复次数。

若启用受限 worker 实验，还需要：

- `worker_runs`：记录 parent_run_id、role、status、terminal_reason、write_boundary_json。
- `worker_events`：把 worker 内部事件按顺序投影到父 session。
- `scratchpad_artifacts`：记录 coordinator/worker 共享但可审计的中间状态。

## 7. 测试计划

- checkpoint/resume 集成测试。
- compaction 后继续执行测试。
- 用户 interrupt/cancel 传播测试。
- browser verification artifact 测试。
- code review finding 定位测试。
- 若启用 worker 实验，必须增加 worker write boundary、cancel propagation、verifier read-only enforcement 测试。

## 8. 验收标准

- 长 session 超过上下文窗口后能 compact 并继续。
- 用户插话能 interrupt 或 queue。
- checkpoint 能恢复关键状态。
- frontend task 能启动/检查页面并产出 artifact。
- code review mode 能输出可定位 findings。

## 9. 退出条件

Phase 5 结束后，agent 可以处理跨多轮、多命令、多文件的复杂 coding 工作，而不是只做短任务。

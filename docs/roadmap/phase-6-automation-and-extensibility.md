# Phase 6 Automation and Extensibility

版本：0.1 草案

状态：规划占位

相关文档：

- [开发计划](development-plan.md)
- [AI Agent Runtime 设计](../architecture/agent-runtime-design.md)

语言：中文

## 1. 阶段目标

在个人本地使用场景下，增加后台任务、本地 API 和扩展机制。

## 2. 用户能力

- 创建定时 coding/check 任务。
- 通过本地 HTTP/SSE API 控制 session。
- 安装或启用插件包。
- 导出本地运行日志。
- 运行 eval harness。

## 3. 必做范围

Automation：

- scheduler。
- scheduled task store。
- automation run history。
- notification hooks。

API：

- local HTTP API。
- SSE event stream。
- session/run/approval endpoints。

Extensibility：

- plugin package。
- provider adapter plugin API。
- tool contribution API。
- local registry。

Evaluation：

- eval harness。
- recorded task suites。
- cost/latency/success metrics。

## 4. 非目标

- 托管 SaaS。
- 多用户权限系统。
- 企业策略管理。

## 5. 架构变化

待定义。

## 6. 数据模型变化

待定义。

## 7. 测试计划

待定义。

## 8. 验收标准

- 定时任务能创建、暂停、运行并记录历史。
- 本地 API 能创建 session、stream events、提交 approval。
- 插件能贡献一个 tool 或 provider adapter。
- eval harness 能运行固定 coding task suite。

## 9. 退出条件

Phase 6 结束后，Mineco 从本地 interface 扩展为可自动化、可扩展、可评估的本地 agent runtime。

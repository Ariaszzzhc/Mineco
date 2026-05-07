# Phase 4 Provider Abstraction

版本：0.1 草案

状态：规划占位

相关文档：

- [开发计划](development-plan.md)
- [Phase 3 Agent Skills](phase-3-agent-skills.md)
- [Agent Runtime 协议](../protocol/agent-runtime-protocol.md)

语言：中文

## 1. 阶段目标

扩展多供应商支持，同时保持 AgentCore 和 interface 不依赖 provider-specific shape。

## 2. 用户能力

- 选择 provider/model。
- 查看当前 model、token、cost。
- provider 不可用时使用安全 fallback。
- 了解 fallback 发生的原因。

## 3. 必做范围

Providers：

- OpenAI-compatible Chat Completions adapter hardening。
- OpenAI Responses adapter。
- Anthropic Messages adapter。
- Local JSON fallback adapter。
- Provider capability registry。
- Model selector。

Runtime：

- capability-driven routing。
- safe fallback policy。
- usage ledger。
- provider error normalization。
- provider state persistence。

Testing：

- adapter fixture tests。
- capability accuracy tests。
- recorded provider event replay。
- unsupported content tests。

Product / Interface：

- model picker。
- provider/model status。
- token/cost display。
- fallback notification。

## 4. 非目标

- 追求所有供应商。
- 自动 benchmark routing。
- 跨供应商发送敏感上下文的隐式 fallback。
- provider marketplace。

## 5. 架构变化

待定义。

## 6. 数据模型变化

待定义。

## 7. 测试计划

待定义。

## 8. 验收标准

- 同一 coding task 能在两个真实 provider 中运行。
- interface 不需要知道 provider 私有字段。
- fallback 前检查 capabilities。
- provider auth/rate limit/context errors 有清晰 UI。
- usage ledger 能记录 input/output/cached/reasoning tokens 中可得字段。

## 9. 退出条件

Phase 4 结束后，多供应商接入边界稳定，新 provider 应该主要实现 adapter 和 fixtures。

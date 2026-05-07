# 《御舆：解码 Agent Harness》逐章分析

日期：2026-05-07

状态：外部资料研究笔记

来源：

- 在线阅读：[https://lintsinghua.github.io/](https://lintsinghua.github.io/)
- GitHub 仓库：[lintsinghua/claude-code-book](https://github.com/lintsinghua/claude-code-book)

## 目标

这组文档用于逐章学习《御舆：解码 Agent Harness》，并对照 Electrolyte 已有设计文档判断是否有可参考之处。

它不直接替代这些源真相：

- [AI Agent Runtime 设计](../../architecture/agent-runtime-design.md)
- [Agent Runtime 协议](../../protocol/agent-runtime-protocol.md)
- [开发计划](../../roadmap/development-plan.md)
- [开发工作流和规范](../../process/development-workflow-and-standards.md)

## 分析方法

每章按同一结构记录：

- 本章核心观点。
- 对 Electrolyte 现有文档的覆盖情况。
- 值得参考的点。
- 暂不采纳或需要谨慎的点。
- 是否建议后续更新 Electrolyte 文档。

## 逐章文档

- [第 01 章：智能体编程的新范式](ch01.md)
- [第 02 章：对话循环](ch02.md)
- [第 03 章：工具系统](ch03.md)
- [第 04 章：权限管线](ch04.md)
- [第 05 章：设置与配置](ch05.md)
- [第 06 章：记忆系统](ch06.md)
- [第 07 章：上下文管理](ch07.md)
- [第 08 章：钩子系统](ch08.md)
- [第 09 章：子智能体与 Fork 模式](ch09.md)
- [第 10 章：协调器模式](ch10.md)
- [第 11 章：技能系统与插件架构](ch11.md)
- [第 12 章：MCP 集成与外部协议](ch12.md)
- [第 13 章：流式架构与性能优化](ch13.md)
- [第 14 章：Plan 模式与结构化工作流](ch14.md)
- [第 15 章：构建你自己的 Agent Harness](ch15.md)
- [附录分析](appendix.md)
- [整体分析](overall-analysis.md)

## 结论预览

Electrolyte 现有文档已经覆盖了这本书的大部分一级架构方向：runtime 分层、供应商中立协议、tool runtime、approval、context、memory、MCP、skills、replay 和阶段路线。

真正值得回看的是细节层：

- 权限与配置的信任来源模型还可以更精细。
- Tool schema、并发属性、输出 artifact 和 UI/render 生命周期可以更早固化。
- Context compaction 需要补断路器和预算阈值。
- Plan mode 的早期缺口已被 Phase 1 gate 采纳：最小版本是 read-only runtime permission mode，包含 plan artifact、plan approval 和批准后恢复原 permission mode。
- 多智能体和 coordinator 应延后，但现有 Phase 5 可以提前记录“只编排不执行”的边界。

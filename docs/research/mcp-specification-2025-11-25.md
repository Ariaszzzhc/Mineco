# MCP Specification 2025-11-25 资料记录

日期：2026-05-07

来源：

- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP 2025-11-25 Key Changes](https://modelcontextprotocol.io/specification/2025-11-25/changelog)
- [MCP 2025-11-25 Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP 2025-11-25 Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [MCP SDKs](https://modelcontextprotocol.io/docs/sdk)
- [MCP SDK Tiering System](https://modelcontextprotocol.io/community/sdk-tiers)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

归属：外部规范资料记录。本文不替代 `docs/roadmap/phase-2-mcp-and-tool-ecosystem.md` 的阶段范围，也不替代 Electrolyte 的 ToolRuntime、approval、sandbox、context 或 security policy；它用于记录 P2 MCP 实现需要对齐的外部协议和 SDK 信息。

## 核心摘要

- 2025-11-25 是当前官方 latest MCP spec。
- 规范声明 MCP 使用 JSON-RPC 2.0，在 host、client、server 之间建立 stateful connection，并通过 capability negotiation 暴露能力。
- Server-side capability 包括 tools、resources 和 prompts。
- Client-side capability 包括 roots、sampling 和 elicitation。
- 官方规范强调安全和信任边界：用户必须理解并同意数据访问和操作；tool 应被谨慎对待；tool annotation 在来自可信 server 前应视为不可信。
- 官方 spec 声明协议要求基于对应的 TypeScript schema，即 `schema/2025-11-25/schema.ts`。

## 2025-11-25 关键变化

- Authorization discovery 增强，支持 OpenID Connect Discovery。
- Tool、resource、resource template 和 prompt 可暴露 icons metadata。
- Authorization 支持通过 `WWW-Authenticate` 做 incremental scope consent。
- 新增 tool naming guidance。
- Elicitation schema 更贴近标准 schema 形态，并支持 titled/untitled、single-select 和 multi-select enum。
- Sampling 增加 tool calling 支持。
- OAuth client id metadata documents 成为推荐的 client registration 机制。
- Tasks 为 experimental，用于 durable request、polling 和 deferred result retrieval。
- JSON Schema 2020-12 成为 MCP schema definitions 的默认 dialect。
- Tool input validation error 应作为 Tool Execution Error，而不是 Protocol Error，以便模型自修正。

## Transport 摘要

- 官方标准 transport 是 stdio 和 Streamable HTTP。
- Clients 应尽可能支持 stdio。
- stdio 模式由 client 启动 MCP server 子进程，stdin/stdout 传输 JSON-RPC message，message 以 newline 分隔。
- stdio server 可以把日志写到 stderr；client 不应假设 stderr 代表错误。
- stdio stdout 必须只写合法 MCP message。
- Streamable HTTP 使用单一 MCP endpoint，支持 POST/GET，并可使用 SSE 承载 server messages。
- Streamable HTTP 对本地 server 有 DNS rebinding 风险，server 应校验 Origin、本地运行时绑定 localhost，并实现认证。
- HTTP request 应携带协商后的 `MCP-Protocol-Version` header，例如 `2025-11-25`。

## Tool 摘要

- Tool schema 包含 `name`、可选 `title`、`description`、可选 `icons`、`inputSchema`、可选 `outputSchema`、可选 `annotations` 和可选 `execution`。
- `inputSchema` 必须是合法 JSON Schema object，默认 dialect 是 JSON Schema 2020-12。
- Tool annotations 在来自可信 server 前必须视为不可信。
- Tool name 建议 1-128 字符、case-sensitive，只使用 ASCII letters、digits、underscore、hyphen 和 dot，且在 server 内唯一。
- Tool result 可以包含 text、image、audio、resource links、embedded resources 和 structured content。
- 如果 tool 提供 output schema，server 返回的 structured result 必须匹配，client 应验证。
- Tool 可以返回 resource links；这些 links 不保证出现在 `resources/list` 结果里。

## 官方 SDK 观察

- 官方 SDK 页面列出 TypeScript、Python、C#、Go 为 Tier 1。
- Tier 1 表示 fully supported SDK，要求完整实现非 experimental protocol features，并覆盖 sampling、elicitation 等 optional capabilities。
- Tier 1 还要求 100% conformance test pass rate、稳定发布、完整文档、dependency policy 和 roadmap。
- TypeScript SDK 是 Electrolyte 最相关的官方 SDK，因为 Electrolyte 是 Node.js-first runtime。
- TypeScript SDK 提供 server/client library、stdio、Streamable HTTP、auth helpers、examples，以及 Express/Hono/Node HTTP 等 thin middleware。
- TypeScript SDK `main` 分支当前是 v2/pre-alpha；仓库 README 仍建议 production 使用 v1.x。实现 P2 时需要重新确认 stable release，并选择当时稳定的 package line。
- v1.x 使用 `@modelcontextprotocol/sdk`；v2 方向使用 split packages，例如 `@modelcontextprotocol/client` 和 `@modelcontextprotocol/server`。

## 对 Electrolyte P2 的参考价值

- 不应手写完整 MCP JSON-RPC、lifecycle、transport、pagination、progress、cancellation、authorization 和 schema 类型；官方 TypeScript SDK 值得作为 protocol/client dependency 使用。
- SDK 不能成为 Electrolyte 的权限边界。ToolRegistry、visibility、permission merge、approval、sandbox、artifact、resource filter、prompt priority、secret redaction、run snapshot 和 replay 仍必须由 Electrolyte 实现。
- SDK client instance 应封装在 `McpClientManager` adapter 内，不应泄漏到 AgentCore、TUI、Provider Adapter 或 ToolRuntime。
- MCP spec 的 tool annotations、description、instructions、prompt 和 resource 内容都应作为不可信输入处理。
- Electrolyte 应显式记录目标 `protocolVersion="2025-11-25"`，并把后续 spec 升级作为兼容性工作，而不是隐式漂移。
- P2 gate 可先以 stdio 为硬验收，Streamable HTTP 和 legacy SSE fallback 作为后续切片或 feature flag；这与 Phase 2 降低早期复杂度的目标一致。

## 仍需实现时确认

- TypeScript SDK v2 是否已稳定；若仍未稳定，应固定 v1.x。
- 官方 conformance tests 是否可直接纳入 Electrolyte CI，还是先通过 fixture MCP servers 和 adapter contract tests 间接覆盖。
- 是否在 P2 就启用 Streamable HTTP，还是只保留接口并推迟到 P2 后续或 Phase 6。
- Tasks 是 experimental，不应进入 P2 gate；如果 SDK 默认暴露相关能力，Electrolyte 应在 ToolRegistry 或 McpClientManager 层显式隐藏。
- Sampling、roots、elicitation 是 client/server initiated advanced flows，需要单独设计 approval 和 UI；P2 gate 可只记录 capability snapshot，不默认执行。

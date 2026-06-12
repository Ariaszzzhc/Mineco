# Mineco 技术设计文档

> 版本:v1 · 对应 [PRD](./PRD.md) · 描述技术选型、架构与落地

## 1. 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| Agent 引擎 | **`@anthropic-ai/claude-agent-sdk`(TypeScript)** | 直接复用成熟 agent 引擎(工具/循环/上下文/权限/skills/subagent 全内置),不自研。本质是 spawn 官方原生 `claude` 二进制并经 stdio 驱动。 |
| 后端运行时 | **Deno**(替代 node) | node 单文件打包有问题;Deno 原生支持 TS、自带 test/lint/fmt、`deno compile` 出单文件可执行;SDK 显式支持 `executable:'deno'`。 |
| 后端工具链 | **Deno 原生**(`deno.json`/`deno test`/`deno lint`/`deno fmt`) | 取代 pnpm/turbo/vitest/biome/tsc,单一工具链。 |
| 存储 | **SQLite + kysely + `node:sqlite`** | Deno 2.2+ 支持 `node:sqlite`;复用现有 kysely 体系;单文件、单写者、零运维。DB 在 `~/.mineco/mineco.db`,只存 UI/统计/配置;**转录由 SDK 原生 JSONL 持久化**(`~/.mineco/projects/`),不进 DB。 |
| 协议 | **stdio newline-delimited JSON-RPC 2.0**(单向 request/response + 双向 notification) | 无端口、最低延迟、生命周期随客户端;JSON-RPC 成熟、带 id 配对。 |
| 前端 | **原生 SwiftUI(macOS)** | 原生体验;作为 thin client,只渲染 + 转发,不碰业务。 |
| 配置/凭证存储 | **SQLite 明文**(含 API Key) | 简单;不用 Keychain。 |

## 2. 总体架构

### 2.1 进程模型

```
Mineco.app (SwiftUI, 原生 UI 壳 / thin client)
  │  stdin/stdout: newline JSON-RPC 2.0
  ▼
core (单一 Deno 进程 = deno compile 产物 mineco-core)
  │  内含: JSON-RPC codec + SessionManager(N 个 SessionRunner) + SQLite(唯一写者)
  │  每个 SessionRunner 驱动:
  ├── claude child #1   (session A 的 SDK query() spawn 出的官方原生二进制)
  ├── claude child #2   (session B)
  └── ...
```

**关键决策:**
- **单一 core 进程**:SwiftUI 启动时 spawn 一个 core,服务所有会话;core 独占 SQLite(单写者,无锁竞争)。
- **每会话一个 claude 子进程**:每个 SDK `query()` 本身 spawn 一个独立 `claude` 二进制(OS 级进程隔离),真正干重活的地方已天然隔离。
- **不引入 Web Worker**:host(core)侧只是薄胶水,重活在 claude child 里;再隔离 host 自己的 GC 收益甚微。N 个 SessionRunner 跑在 core 同一事件循环里,协作式异步(都在等 I/O),互不阻塞。

### 2.2 职责分层(thin client 原则)

- **SwiftUI**:只渲染流式消息 + 转发用户意图(JSON-RPC)。**不做任何业务逻辑**——不解析配置、不持有机密、不读业务 DB、不跑状态机。
- **core**:全部业务——配置读写、profile 解析、凭证取出、env 组装、SessionRunner 状态机、SQLite、SDK 调用、用量记录。

## 3. Agent 引擎:claude-agent-sdk 如何用

**SDK 原理**:`query()` = spawn 官方 `claude` 原生二进制 + 经 stdio JSON 控制协议驱动它 + 把事件流式转成类型化 `SDKMessage`。真正的 agent 逻辑(loop/工具/权限/上下文/skills/subagent)都在那个 child 二进制里,和 `claude` CLI 同引擎。SDK 给的是程序化、可流式、可拦截的入口 + 钩子(`canUseTool`/`hooks`/MCP)。

**我们用到的 SDK 能力:**
- `query({ prompt: AsyncIterable<SDKUserMessage>, options })` —— **streaming-input 模式**,多轮交互;`prompt` 传异步队列,塞一条 = 接着对话。
- `Query` 对象:`interrupt()` / `setModel()` / `setPermissionMode()` / `setMcpServers()` / `applyFlagSettings()` / `close()`(streaming 模式下生效)。
- `for await (const msg of q)` —— 流式收 `SDKMessage`;其中 `result` 消息带 `usage` + `total_cost_usd`(用量统计来源)。
- `Options.canUseTool` —— 权限回调,转发给 UI。
- 转录持久化走 **SDK 原生**(`persistSession` 保持默认 `true`,**不用**标 alpha 的 `sessionStore`):子进程边跑边把 JSONL 同步写到 `CLAUDE_CONFIG_DIR`,durable、抗强杀;resume 跨 child 续对话由 SDK 自己完成。
- `Options.executable:'deno'`、`Options.pathToClaudeCodeExecutable`(指向随包二进制)、`Options.env`(喂鉴权/端点/模型 env)、`Options.settingSources:[]`(关掉 Claude 文件 settings,全用我们 profile)。
- `Options.resume: sessionId` —— 续接会话。
- `startup()` / `WarmQuery`(可选)—— 预热 child,降首回合延迟。

**鉴权/端点/模型的注入**(全部由 core 从 profile 组装,经 `Options.env` 喂给 child):
- 模型:`Options.model` / `ANTHROPIC_MODEL` env / 运行时 `setModel()`。
- 鉴权:`ANTHROPIC_API_KEY`(API Key,x-api-key)/ `ANTHROPIC_AUTH_TOKEN`(自定义网关 Bearer)/ `CLAUDE_CODE_OAUTH_TOKEN`(订阅,v1 不做)/ Bedrock/Vertex 各自 env(v1 不做)。
- 端点:`ANTHROPIC_BASE_URL`(自定义网关)。
- ⚠️ `Options.env` 是**替换**非合并,必须 `{ ...Deno.env.toObject(), ...profileEnv }` 手动 merge,否则丢继承的 env。自定义端点时 `ANTHROPIC_API_KEY=""` 关默认鉴权。
- 不依赖 `~/.claude`;设 `CLAUDE_CONFIG_DIR=~/.mineco` 为**持久目录**(转录的事实来源,不是 scratch、不放 temp),凭证仍由我们 env 喂。

## 4. 通信协议(JSON-RPC 2.0,stdio,单向)

**单向模型**:只有 SwiftUI 主动发 Request(core 不发 Request);core 只发 Notification。三种消息:

| 种类 | 有无 id | 用途 |
|---|---|---|
| Request(SwUI→core) | 有,等 Response | 调命令、要结果 |
| Response(core→SwUI) | 同 Request id | `{result}` 或 `{error}` |
| Notification(双向) | 无,不等 | 流式事件、fire-and-forget 动作 |

### 4.1 Request(SwiftUI → core)

- `config/listProfiles` / `config/saveProfile { profile }` / `config/deleteProfile { id }` / `config/setActiveProfile { id }`
- `usage/get { range?, groupBy?: model|session|day }` → 聚合用量
- `session/list { workspacePath? }`
- `session/create { cwd, profileId?, title? }` → `{ sessionId, init }`(`q.initializationResult()`)
- `session/resume { sessionId }`
- `session/send { sessionId, content }` —— *(待定 Request ack 还是 Notification;倾向 Notification 低延迟)*
- `session/interrupt { sessionId }` / `session/close { sessionId }` / `session/messages { sessionId, limit?, offset? }`
- `session/setModel { sessionId, model }` / `session/setPermissionMode { sessionId, mode }` / `session/setMcpServers { sessionId, servers }` / `session/applyFlagSettings { sessionId, settings }`
- `session/setProfile { sessionId, profileId }` —— 切连接
- `session/respondPermission { sessionId, toolUseID, behavior, updatedPermissions?, message? }` —— 权限回复

### 4.2 Notification(core → SwiftUI,均带 sessionId)

- `session/message { sessionId, message: SDKMessage }` —— 流式消息(含 partial token、result)
- `session/permissionRequest { sessionId, request_id=toolUseID, toolName, input, suggestions?, ... }`
- `ready { pid, version }` —— 可选,诊断用
- `stderr { data }` / `error { sessionId?, message }`

### 4.3 权限往返(单向实现)

```
core(canUseTool 回调触发,Promise 挂在 toolUseID)
  → notification  session/permissionRequest { sessionId, request_id: toolUseID, toolName, input, ... }
SwiftUI(弹原生确认)
  → request       session/respondPermission { sessionId, toolUseID, behavior, ... }
  ← response      { ok }
core 用 toolUseID 解开 Promise → 回复 child
```
关联用业务 id(`toolUseID`),非 transport id。core 对 canUseTool 设**自己的超时**(超时默认 deny),不无限等用户。

## 5. 数据模型(greenfield SQLite,`~/.mineco/mineco.db`)

| 表 | 字段 | 说明 |
|---|---|---|
| `workspaces` | id, path(unique), name, last_opened_at, created_at | 结构性:最近项目/session 归属 |
| `sessions` | id, title, workspace_id, profile_id, created_at, updated_at | 简化,无 worktree 字段 |
| `messages` | id, session_id, seq, payload(json=SDKMessage), created_at | UI 渲染/历史用的投影缓存(`for await` 流的落库),可重建;**不承担 resume**(转录事实来源是 SDK 原生 JSONL) |
| `usage_records` | id, session_id, model, provider_id, input_tokens, output_tokens, cache_read, cache_write, cost_usd, created_at | 唯一保留的旧功能 |
| `provider_profiles` | id, name, provider(anthropic\|custom), api_key, base_url, default_model, permission_mode, allowed_tools(json), mcp_servers(json), is_active | 连接配置,明文 |

迁移从零写(greenfield,不迁旧数据)。单进程单连接 + WAL + 写串行。

## 6. 配置与鉴权(Mineco 自管)

- **Profile** 概念:一套连接 = {provider, api_key, base_url, default_model, permission_mode, allowed_tools, mcp_servers}。存 `provider_profiles`(明文含 api_key)。
- **core 在 `session/create` 时解析 profile**:从 SQLite 取 profile → 组 `Options.env`(鉴权/端点)+ `Options.model`/`permissionMode`/`allowedTools`/`mcpServers` → spawn child。**SwiftUI 不传任何机密**,`session/create` 只传 `{ cwd, profileId?, title? }`。
- 一期 Profile 类型:`anthropic`(API Key 直连)与 `custom`(`ANTHROPIC_BASE_URL` + Bearer token)。OAuth/订阅、Bedrock/Vertex 不做。
- `settingSources:[]` 关掉 Claude 文件 settings,配置 100% 由 Mineco profile 决定。

## 7. Session 生命周期与 Profile 切换

**SDK 硬约束**:`auth` / `provider` / `ANTHROPIC_BASE_URL` / `systemPrompt` 是 child spawn 时定死、运行中不可热改;只有 model/permissionMode/mcpServers/tools 可经 `setModel` 等热改。

**SessionRunner 状态机**(`packages/core/session/runner.ts`):持有 `inputQueue`(AsyncQueue) + `query` 句柄 + `pending: Map<toolUseID, resolve>` + `config` + `pendingProfile` 槽。

- 生命周期:`create` → spawn+initialize → **idle** → (`send` 入队 → child 跑 → 流式 `session/message` → 落库 → `result` → 回 **idle**)→ `close`。
- **`session/setProfile`** 统一走「换 child」(不分 soft/hard):`q.close()` → `query({ resume: sessionId, options: 新profile })`,新 child 经 **SDK 原生 resume** 从 `~/.mineco` 本地转录加载续对话(cwd 不变 → projectKey 一致),所有 profile 字段(含凭证/systemPrompt)在新 child 启动生效。
  - session **idle** → 立即换。
  - session **running** → 记 `pendingProfile`(覆盖式,多次取最后),回合跑到 `result` 回 idle 时,turn-end 钩子自动应用。不打断用户在跑的任务。
- 轻调节(`setModel`/`setPermissionMode`/`setMcpServers`/`applyFlagSettings`)是独立 RPC,直接转 SDK 方法,同 child 秒级改,不涉及连接;与 `setProfile` 不混用。

## 8. 启动与生命周期(无握手)

core 与 UI 同包发布,版本/能力永远一致,**无任何握手/版本协商**:

- SwiftUI `Process` 拉起 core → core 开 DB → 跑迁移 → 装 JSON-RPC codec → 进 stdin 读循环。
- `pathToClaudeCodeExecutable` 由 core 自解析(编译产物取同目录 `Resources/claude`;dev 取 npm 缓存),不经协议。
- SwiftUI spawn 后直接发首个 request(`config/listProfiles` + `session/list`);OS pipe 自带缓冲,无需等就绪。
- (可选)`ready` notification 纯诊断。
- **生命周期**:SwiftUI 监听 core process exit → 崩溃则重启 + 从本地恢复;用户退 app 则不重启。状态全在本地(SQLite + SDK 转录 JSONL),不靠握手恢复。

## 9. 工程与构建

### 9.1 目录结构(Deno workspace)

```
deno.json                    # 根: workspaces, tasks(test/lint/fmt/compile), fmt 规则
packages/
  protocol/                  # JSON-RPC 类型 + zod schema + fixtures(TS↔Swift contract)
    mod.ts, schema.ts, fixtures/
  core/                      # 单一 core 进程
    bin/main.ts              # 入口
    server.ts                # JSON-RPC 方法路由
    transport/{jsonrpc,stdio}.ts
    session/{manager,runner,permission,async_queue}.ts
    db/{kysely,migrator,migrations/,repositories/}.ts
    config.ts                # ~/.mineco、CLAUDE_CONFIG_DIR、profile→env/Options、cli
macos/                       # SwiftUI(独立 Xcode 工程,不属 Deno workspace)
  Mineco/
    App/, RPC/{JSONRPCClient,Protocol}.swift, Models/, Views/, Resources/
```

### 9.2 打包与分发

- **core 编译**(根 task `compile`):
  `deno compile --output macos/Mineco/Resources/mineco-core --target aarch64-apple-darwin -A packages/core/bin/main.ts`
- **原生 claude 二进制**:从 `npm:@anthropic-ai/claude-agent-sdk-darwin-arm64` 解出 `claude`,拷到 `macos/Mineco/Resources/claude`;core 用 `pathToClaudeCodeExecutable` 指向它(绕开 `deno compile` 无法解析内嵌二进制,见 SDK issue #150)。
- **macOS 分发**:Xcode 工程;签名 / 公证(待定细节)。

### 9.3 CLAUDE.md 规则更新

旧规则「always run `pnpm test`」/「do not run dev server」重写后等价为 **`deno test`** / 不跑 dev server。实施时同步改 CLAUDE.md。

## 10. 落地步骤(每步可独立验证)

1. **清场 + 脚手架**:删 `packages/{agent,provider,core,app,web,mineco}` 与 pnpm/turbo/biome/vitest 配置;根 `deno.json`;新增 `packages/protocol`、`packages/core` 空壳 + 依赖;更新 CLAUDE.md。
2. **`packages/protocol`**:session-scoped 类型 + zod + JSON Schema + fixtures。
3. **`packages/core` 纯逻辑 + DB**:greenfield 迁移 + repositories;`async_queue`/`jsonrpc`/`permission` 单测。
4. **`SessionRunner` + `SessionManager` + `server` + `bin/main.ts`**:接 SDK;`executable:'deno'`、`CLAUDE_CONFIG_DIR`、`pathToClaudeCodeExecutable`;fake manager 路由单测;可选 integration(env 守)。
5. **打包验证**:`deno compile` 出 core;解出原生 `claude`;手动喂 `session/list`/`session/create` 验拉起 SDK。
6. **`macos/` Swift 工程**:`JSONRPCClient` 拉起 core,打通 `session/list` + `session/create` + 一条 `session/message`。
7. **SwiftUI 视图**:`SessionListView` → `SessionView`(流式)→ `ComposerView`(send)→ `PermissionSheet`;端到端:发对话、看流式、触发权限、关停重开能 resume。
8. **contract 测试**:fixtures 双端 round-trip 锁协议。

## 11. 测试策略

- **单测**(`deno test`):protocol / jsonrpc / async_queue / permission / repositories / manager —— 纯逻辑,fake 依赖。
- **冒烟**:`echo '<json>' | deno run -A packages/core/bin/main.ts`,看响应(需 `ANTHROPIC_API_KEY`)。
- **端到端**:Xcode 跑 app 连 core,完整走一遍发话→流式→权限→resume。
- **并发验证**:开 2+ session,其一跑长 bash,验证另一个不卡顿。
- **不跑 dev server**(遵循 CLAUDE.md 精神)。

## 12. 风险与对策

| 风险 | 对策 |
|---|---|
| `deno compile` + SDK 内嵌原生 claude 二进制解析失败(issue #150) | 用 `pathToClaudeCodeExecutable` 指向随包同级 `claude`(已设计)。第 6 步优先验证。Fallback:.app 附带 `deno.json`+缓存用 `deno run`,或回退 bun compile(SDK 官方主推 + `extractFromBunfs`)。 |
| `node:sqlite` 同步写短暂卡事件循环 | 单写者 + WAL + 写小行通常 sub-ms;child 重活不进 host 事件循环。必要时加写队列批量落盘。 |
| streaming-input 模式限制 | `setModel` 等仅 streaming 模式生效;协议层保证仅 session 创建后调用,否则返错误码。 |
| 协议演进(TS↔Swift 漂移) | TS zod schema 单一事实来源 + fixtures 双向 contract 测试。一期人工维护 Swift Codable。 |

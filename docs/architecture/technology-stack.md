# Technology Stack 使用说明

版本：0.1 草案

状态：技术基线

相关文档：

- [AI Agent Runtime 设计](agent-runtime-design.md)
- [Phase 0 本地 Agent 执行架构](../roadmap/phase-0-local-agent-execution.md)
- [开发工作流和规范](../process/development-workflow-and-standards.md)

语言：中文

## 1. 当前基线

Phase 0 采用：

- Node.js 25+。
- TypeScript strict mode。
- pnpm workspace。
- Turborepo 作为 monorepo task runner。
- Biome 作为 formatter、linter 和 import organizer。
- Vitest。
- Zod。
- LogTape。
- SQLite。
- Kysely 作为 SQLite query builder 和 migration layer。
- Node.js 内置 `node:sqlite` 作为 SQLite driver。
- Effect 作为 runtime 内部结构化并发、资源作用域、错误建模和依赖注入核心。
- REPL-style terminal interface。
- OpenAI-compatible Chat Completions provider。

### 1.1 开发工具链边界

开发环境参考 `main` 分支已落地配置：

- root `package.json` 固定 `packageManager: pnpm@10.29.3`，`engines.node >= 25`，`engines.pnpm = 10.29.3`。
- workspace 由 `pnpm-workspace.yaml` 管理，范围是 `packages/*`。
- root `biome.json` 是代码格式化、lint 和 import organization 的源真相。
- root `turbo.json` 是 monorepo task graph、缓存和 persistent dev task 的源真相。

工具职责：

- pnpm 只负责 package manager、workspace resolution 和 script 入口。
- Turborepo 负责跨 package 编排 `build`、`check`、`dev` 等任务；package 内仍保留自己的脚本实现。
- Biome 负责格式化、lint 和 import organization；不再单独引入 Prettier 或 ESLint，除非某个生态插件有明确不可替代需求并写入本文档。
- Vitest 负责测试执行；测试命令可以由 root script 或后续 Turborepo task 编排，但测试框架仍是 Vitest。

### 1.2 Biome 使用规则

Biome 默认配置对齐 `main`：

- `vcs.enabled = true`，使用 Git ignore file。
- formatter 使用 space indentation。
- linter 开启 recommended rules。
- TypeScript/JavaScript 使用 double quotes 和 semicolons。
- `noNonNullAssertion` 设为 warning。
- source action 开启 organize imports。
- CSS parser 支持 Tailwind directives。

规则：

- root `pnpm lint` 对应 `biome check .`。
- root `pnpm lint:fix` 对应 `biome check --fix .`。
- root `pnpm format` 对应 `biome format --fix .`。
- package 级 `biome.json` 只允许 `extends: "//"` 或极少量局部覆盖；覆盖原因必须能被对应 package 的构建或 parser 需求解释。
- 格式化和 lint 修复不应混入无关重构；大规模机械改动需要独立提交或独立 PR。

### 1.3 Turborepo 使用规则

Turborepo 默认配置对齐 `main`：

- `build` 依赖上游 package 的 `^build`，输出 `dist/**`。
- 桌面打包类 build 可以声明自己的输出目录并关闭 cache。
- `check` 不依赖上游任务，保持快速类型检查入口。
- `dev` 关闭 cache，声明为 persistent task。
- `test` 可以依赖上游 `^build`，用于需要已构建依赖的 package 测试。

规则：

- root `pnpm build` 对应 `turbo run build`。
- root `pnpm check` 对应 `turbo run check`。
- root `pnpm dev` 使用 `turbo run dev` 并通过 `--filter` 限定需要启动的 package。
- 每个 package 暴露稳定的 `build` / `check` / `dev` / `test` 脚本时，应让脚本语义适合被 Turborepo 编排；不要在 package 脚本里隐式启动不相关服务。
- cache outputs 必须只包含可重建产物，不包含 `.env`、数据库、runtime session、artifact 或用户 workspace 内容。

## 2. Logging 使用规则

项目日志实现使用 LogTape，核心依赖为 `@logtape/logtape`。参考官方 Quick start：[LogTape Quick start](https://logtape.org/manual/start)。

Effect runtime 内的日志必须通过 Effect custom logger 转发到 LogTape。参考 Effect 官方说明：[Custom loggers](https://effect.website/docs/observability/logging/#custom-loggers)。

LogTape 的职责：

- runtime、provider adapter、ToolRuntime、Store、sandbox runner、REPL/TUI 的诊断日志。
- 结构化日志字段，例如 `sessionId`、`runId`、`toolName`、`provider`、`durationMs`、`terminalReason`。
- 本地调试、bug report、测试诊断和未来导出运行日志。

LogTape 不承担：

- `RuntimeEvent` stream。
- `runtime_events` / `provider_events` 持久化。
- transcript source of truth。
- approval audit source of truth。
- artifact content store。

配置规则：

- application entry point 负责调用 LogTape `configure()`。
- library/runtime 内部模块只通过 `getLogger(["mineco", ...])` 获取 logger，不在库模块里调用 `configure()`。
- Phase 0 默认 sink 是 console 或 stderr，必须适合 REPL；后续可以增加 file sink、rotating file sink 或 OpenTelemetry sink。
- 日志 category 使用数组层级，例如 `["mineco", "runtime"]`、`["mineco", "tool", "shell"]`、`["mineco", "provider", providerId]`。
- 默认日志级别应保守，普通用户运行时不输出 debug/trace 噪音；debug/trace 通过 CLI flag 或 config 打开。
- 所有日志必须经过 secret redaction；不得记录 API key、env secret、provider raw auth header、完整用户文件内容或未截断的大输出。
- 结构化日志优先于拼接字符串；昂贵字段使用 lazy evaluation 或先检查 level。

### 2.1 Effect 和 LogTape 的边界

LogTape 是项目唯一的诊断日志后端。Effect 的 `Effect.log*`、`Effect.annotateLogs`、`Effect.withLogSpan` 只作为 fiber 内的日志 API 使用，不能让 Effect 内置 logger 直接写 console、JSON 或 pretty output。

入口层必须在调用 `configure()` 之后，为顶层 runtime program 提供一个 Effect logger layer：

```ts
import { getLogger } from "@logtape/logtape";
import { Effect, Logger } from "effect";

type LogTapeLevel = "trace" | "debug" | "info" | "warning" | "error" | "fatal";

function toLogTapeLevel(effectLabel: string): LogTapeLevel {
  switch (effectLabel) {
    case "TRACE":
      return "trace";
    case "DEBUG":
      return "debug";
    case "INFO":
      return "info";
    case "WARNING":
      return "warning";
    case "ERROR":
      return "error";
    case "FATAL":
      return "fatal";
    default:
      return "info";
  }
}

export function makeEffectLogTapeLogger(category: readonly string[]) {
  const logtape = getLogger(category);

  return Logger.make(({ logLevel, message, annotations, spans, fiberId, date, cause }) => {
    const properties = redactLogProperties({
      effectAnnotations: effectAnnotationsToRecord(annotations),
      effectSpans: effectSpansToRecord(spans),
      effectFiberId: String(fiberId),
      effectCause: effectCauseToSafeSummary(cause),
    });

    logtape.emit({
      timestamp: date,
      level: toLogTapeLevel(logLevel.label),
      message: effectMessageToArray(message),
      rawMessage: effectMessageToString(message),
      properties,
    });
  });
}

export const EffectLogTapeLive = Logger.replace(
  Logger.defaultLogger,
  makeEffectLogTapeLogger(["mineco", "runtime"]),
);

export const provideEffectLogging = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  program.pipe(Effect.provide(EffectLogTapeLive));
```

示例里的 `redactLogProperties()`、`effectAnnotationsToRecord()`、`effectSpansToRecord()`、`effectCauseToSafeSummary()`、`effectMessageToArray()` 和 `effectMessageToString()` 是项目内 helper，必须在 `packages/runtime/src/logging/` 边界实现并测试。

规则：

- Effect program 内优先使用 `Effect.logInfo` / `Effect.logDebug` / `Effect.logError`、`Effect.annotateLogs` 和 `Effect.withLogSpan`，不要在 fiber 内直接拿 LogTape logger 旁路记录。
- 非 Effect 边界代码仍可直接使用 `getLogger(["mineco", ...])`。
- Effect custom logger category 必须由代码常量决定，例如 `["mineco", "runtime"]`、`["mineco", "tool"]`；不得从用户输入、provider 输出或文件内容拼接 category。
- Effect log annotations 映射为 LogTape structured properties；`sessionId`、`runId`、`toolCallId`、`provider` 等关联字段优先放在 annotation 中。
- Effect log spans 映射为 LogTape structured properties；不要把 span 名称当成 LogTape category。
- Effect `Cause` 只能记录 redacted summary，完整 cause、provider raw payload 或 terminal output 必须进入受控 artifact/event 边界，而不是日志。
- `Logger.withMinimumLogLevel()` 只作为 Effect 侧 fiber 局部过滤；全局 sink、formatter 和最低级别仍由 LogTape `configure()` 管理。
- 测试可以提供 test logger layer，但 production runtime 不使用 `Logger.pretty`、`Logger.json` 或裸 `Logger.defaultLogger`。

## 3. Kysely 使用规则

Kysely 是持久化层的主 API。业务代码不直接操作 `node:sqlite` statement，也不手写 ad hoc SQL 字符串。例外：

- migration 文件中的 DDL。
- Kysely 无法表达或明显不适合表达的 SQLite pragma / maintenance SQL。
- 性能敏感路径经测试证明需要 raw SQL。

所有例外必须留在 `packages/runtime/src/store/` 边界内。

### 3.1 node:sqlite dialect

Kysely 官方 SQLite dialect 默认面向 `better-sqlite3`。本项目使用 Node.js 内置 `node:sqlite`，因此需要项目内 dialect。

实现方式：

- 参考 `wolfie/kysely-node-native-sqlite` 的 `NodeNativeSqliteDialect` 思路。
- 将必要 dialect/driver/connection/adapter 代码内联到本仓库。
- 不把该 adapter 作为外部运行时依赖。
- 内联代码放在 `packages/runtime/src/store/kysely-node-sqlite/`。
- 保留来源注释、license 说明和本项目修改点。

目标初始化形态：

```ts
import { Kysely } from "kysely";
import { NodeSqliteDialect } from "./kysely-node-sqlite/dialect.js";
import type { RuntimeDb } from "./schema.js";

export function createRuntimeDb(path: string): Kysely<RuntimeDb> {
  return new Kysely<RuntimeDb>({
    dialect: new NodeSqliteDialect({
      path,
      pragmas: {
        journalMode: "wal",
        foreignKeys: true,
      },
    }),
  });
}
```

### 3.2 Schema 类型

数据库 schema 类型放在：

```text
packages/runtime/src/store/schema.ts
```

规则：

- 表类型与 SQLite schema 一一对应。
- JSON 字段在 DB 层是 `string`，Store adapter 负责 encode/decode。
- 不把 Kysely generated row type 泄漏到 AgentCore。
- Store 对外返回 protocol/runtime 类型。

示例：

```ts
import type { Generated, Insertable, Selectable } from "kysely";

export interface RuntimeDb {
  sessions: SessionsTable;
  runs: RunsTable;
  items: ItemsTable;
  runtime_events: RuntimeEventsTable;
  provider_events: ProviderEventsTable;
  approvals: ApprovalsTable;
  artifacts: ArtifactsTable;
  migrations: MigrationsTable;
}

export interface ItemsTable {
  id: string;
  session_id: string;
  seq: number;
  type: string;
  json: string;
  created_at: string;
}

export type ItemRow = Selectable<ItemsTable>;
export type NewItemRow = Insertable<ItemsTable>;
```

### 3.3 Migrations

Kysely migrations 是 SQLite schema 的唯一迁移入口。

位置：

```text
packages/runtime/src/store/migrations/
  0001_initial.ts
```

规则：

- migration 必须有 `up`。
- destructive migration 必须有明确 `down` 或写明不可逆原因。
- migration 文件名稳定、递增、可排序。
- migration 通过 Vitest 覆盖：空数据库迁移、重复迁移、基础 insert/query。
- 应用启动时可以自动运行已知安全 migrations；未来破坏性 migrations 需要显式 gate。

示例：

```ts
import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("sessions")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("status", "text", (col) => col.notNull())
    .addCheckConstraint(
      "sessions_status_check",
      sql`status in ('created', 'running', 'waiting_for_user', 'completed', 'failed', 'cancelled')`,
    )
    .addColumn("workspace_path", "text", (col) => col.notNull())
    .addColumn("model", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) => col.notNull())
    .addColumn("updated_at", "text", (col) => col.notNull())
    .execute();
}
```

### 3.4 Store 边界

`RuntimeStore` 是 AgentCore 看到的唯一持久化接口。

```ts
export interface RuntimeStore {
  createSession(input: CreateSessionInput): Effect.Effect<void, StoreError>;
  appendItem(input: AppendItemInput): Effect.Effect<void, StoreError>;
  appendRuntimeEvent(input: AppendRuntimeEventInput): Effect.Effect<void, StoreError>;
  listSessions(): Effect.Effect<RuntimeSessionSummary[], StoreError>;
  getSession(sessionId: string): Effect.Effect<RuntimeSession, StoreError>;
  getActiveRun(sessionId: string): Effect.Effect<AgentRun | null, StoreError>;
  listRuntimeEvents(sessionId: string, query?: EventLogQuery): Effect.Effect<EventPage<RuntimeEventRecord>, StoreError>;
  listProviderEvents(sessionId: string, query?: EventLogQuery): Effect.Effect<EventPage<ProviderEventRecord>, StoreError>;
  listApprovals(sessionId: string, query?: ApprovalQuery): Effect.Effect<EventPage<ApprovalRecord>, StoreError>;
  listArtifacts(sessionId: string, query?: ArtifactQuery): Effect.Effect<EventPage<ArtifactRef>, StoreError>;
  readArtifact(id: string): Effect.Effect<ArtifactBlob, StoreError>;
}
```

Store implementation 可以用同步 `node:sqlite`，但必须包装成 Effect，保证错误类型、作用域和中断语义一致。

## 4. Effect 使用规则

Effect 是 runtime 内部执行模型。它用于处理：

- Agent run loop。
- tool execution。
- shell process lifetime。
- provider streaming。
- approval wait / interruption。
- session lock。
- timeout / retry / cancellation。
- resource cleanup。
- service dependency injection。

Effect 不用于替代协议类型、Zod schema 或纯数据模型。

### 4.1 Public API 边界

内部使用 Effect，外部 SDK 保持普通 TypeScript API：

```ts
interface AgentRuntime {
  createSession(input: CreateSessionInput): Promise<RuntimeSession>;
  runSession(sessionId: string): AsyncIterable<RuntimeEvent>;
  sendMessage(sessionId: string, message: string): Promise<void>;
  decideApproval(approvalId: string, decision: ApprovalDecision): Promise<void>;
  cancelSession(sessionId: string, reason?: string): Promise<void>;
  listSessions(): Promise<RuntimeSessionSummary[]>;
  getSession(sessionId: string): Promise<RuntimeSession>;
  getActiveRun(sessionId: string): Promise<AgentRun | null>;
  listRuntimeEvents(sessionId: string, query?: EventLogQuery): Promise<EventPage<RuntimeEventRecord>>;
  listProviderEvents(sessionId: string, query?: EventLogQuery): Promise<EventPage<ProviderEventRecord>>;
  listApprovals(sessionId: string, query?: ApprovalQuery): Promise<EventPage<ApprovalRecord>>;
  listArtifacts(sessionId: string, query?: ArtifactQuery): Promise<EventPage<ArtifactRef>>;
  readArtifact(id: string): Promise<ArtifactBlob>;
  listMcpServers(sessionId: string, query?: McpServerQuery): Promise<EventPage<McpServerSummary>>;
  listMcpTools(sessionId: string, query?: McpToolQuery): Promise<EventPage<RuntimeToolSpec>>;
  getMcpToolSpec(sessionId: string, toolId: string): Promise<RuntimeToolSpec>;
  setMcpServerEnabled(sessionId: string, serverId: string, enabled: boolean): Promise<McpServerSummary>;
  reloadMcpServer(sessionId: string, serverId: string): Promise<McpServerSummary>;
  disconnectMcpServer(sessionId: string, serverId: string): Promise<McpServerSummary>;
  refreshMcpDiscovery(sessionId: string, input?: McpDiscoveryRefreshInput): Promise<McpDiscoveryResult>;
  listSkillRoots(sessionId: string): Promise<EventPage<SkillRootSummary>>;
  listSkills(sessionId: string, query?: SkillQuery): Promise<EventPage<SkillSummary>>;
  getActiveSkillSnapshot(sessionId: string, runId?: string): Promise<ActiveSkillSnapshot>;
  setSkillEnabled(sessionId: string, skillId: string, enabled: boolean): Promise<SkillSummary>;
  pinSkill(sessionId: string, skillId: string, pinned: boolean): Promise<SkillSummary>;
  reloadSkillRoots(sessionId: string): Promise<SkillReloadResult>;
}
```

SDK adapter 负责：

- `Effect.runPromise` 转 Promise。
- Effect stream / Queue 转 AsyncIterable。
- 将 typed errors 映射成 `AgentError` 或 rejected promise。
- 所有产品动作先落到 Runtime SDK；REPL/TUI 不直接调用 Store、McpClientManager、SkillRegistry 或 ToolRegistry。

不要把 `Effect.Effect<...>` 暴露给 REPL 或外部 API。

### 4.2 Services and Layers

Runtime dependencies 用 Effect service + Layer 表达。

第一批 service：

- `RuntimeStoreService`
- `ProviderService`
- `ToolRuntimeService`
- `SandboxRunnerService`
- `ApprovalService`
- `RuntimeEventBusService`
- `ConfigService`
- `LoggerService`

示例：

```ts
import { Context, Effect, Layer } from "effect";

export interface RuntimeStoreService {
  appendItem(input: AppendItemInput): Effect.Effect<void, StoreError>;
}

export const RuntimeStoreService =
  Context.GenericTag<RuntimeStoreService>("RuntimeStoreService");

export const RuntimeStoreLive = Layer.scoped(
  RuntimeStoreService,
  Effect.acquireRelease(
    Effect.sync(() => openStore()),
    (store) => Effect.sync(() => store.close()),
  ),
);
```

### 4.3 Structured Concurrency

每个 `AgentRun` 对应一个顶层 Effect fiber scope。

规则：

- run 取消时，所有 provider stream、tool call、shell process、approval wait 必须被 interrupt。
- 不使用裸 `setTimeout`、裸 background promise 或无归属 event listener。
- 后台任务必须 fork 在当前 run scope 内，除非明确是 scheduler/daemon。
- shell process 必须注册 finalizer，interrupt 时 kill process tree。
- provider stream 必须注册 finalizer，interrupt 时 abort request。

推荐模式：

```ts
const runSession = Effect.scoped(
  Effect.gen(function* () {
    const store = yield* RuntimeStoreService;
    const tools = yield* ToolRuntimeService;

    yield* store.appendRuntimeEvent({ type: "run.started" });

    const result = yield* agentLoop.pipe(
      Effect.timeout("10 minutes"),
      Effect.catchAllCause((cause) => mapCauseToTerminalReason(cause)),
    );

    return result;
  }),
);
```

### 4.4 Errors

Runtime 内部错误使用 typed error class 或 tagged data。

建议错误族：

- `StoreError`
- `ProviderError`
- `ToolExecutionError`
- `PermissionError`
- `ApprovalError`
- `SandboxError`
- `ContextError`
- `InternalError`

边界规则：

- Tool validation / permission denied 通常 model-visible。
- Provider auth / secret errors runtime-only。
- Internal invariant failure runtime-only。
- Effect `Cause` 必须在 run 终止时转换成 `TerminalReason` 和 `AgentError`。

### 4.5 Retry / Timeout / Schedule

Effect Schedule 用于：

- retryable provider errors。
- transient store busy / SQLite locked。
- long-running polling。
- scheduler heartbeat。

不要在业务代码里手写不受控 retry loop。retry policy 必须可测试，并记录 runtime event。

### 4.6 Testing

测试使用 Vitest。Effect 程序在测试中通过 `Effect.runPromise` 或测试 helper 执行。

可以后续引入 `@effect/vitest`，但 Phase 0 不要求。Phase 0 先使用普通 Vitest：

```ts
import { Effect } from "effect";
import { expect, test } from "vitest";

test("append item", async () => {
  const result = await Effect.runPromise(
    program.pipe(Effect.provide(TestRuntimeLayer)),
  );

  expect(result).toEqual(...);
});
```

## 5. 依赖策略

Phase 0 root dependencies：

```text
dependencies:
  @logtape/logtape
  effect
  kysely
  zod

devDependencies:
  @biomejs/biome
  turbo
  typescript
  vitest
```

不引入 ORM。Kysely 是 query builder/migration layer，不拥有 domain model。

不引入外部 SQLite native package。SQLite driver 使用 Node.js 25 的 `node:sqlite`。

不引入外部 Kysely node:sqlite dialect package。项目内联 dialect，降低长期维护风险并保证 Node 25 行为可控。

## 6. 设计理由

Kysely 解决 SQLite 查询和 migration 的类型安全问题，同时保持 SQL 可见、可审计。

Effect 解决 agent runtime 的结构化并发问题：run cancellation、tool timeout、provider stream abort、approval waiting、resource cleanup 和 typed errors 都需要统一模型。

LogTape 解决普通诊断日志的结构化输出、category、sink 和未来集成问题。它是 logging implementation，不是 runtime state model；不能替代 RuntimeEvent、Store、audit 或 artifact。

这些技术栈都必须停留在 runtime 内部边界内：协议、transcript item、provider-neutral ARP 和 REPL/TUI event schema 不能依赖某个库的私有类型。

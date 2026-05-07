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
- Vitest。
- Zod。
- LogTape。
- SQLite。
- Kysely 作为 SQLite query builder 和 migration layer。
- Node.js 内置 `node:sqlite` 作为 SQLite driver。
- Effect 作为 runtime 内部结构化并发、资源作用域、错误建模和依赖注入核心。
- REPL-style terminal interface。
- OpenAI-compatible Chat Completions provider。

## 2. Logging 使用规则

项目日志实现使用 LogTape，核心依赖为 `@logtape/logtape`。参考官方 Quick start：[LogTape Quick start](https://logtape.org/manual/start)。

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
- library/runtime 内部模块只通过 `getLogger(["electrolyte", ...])` 获取 logger，不在库模块里调用 `configure()`。
- Phase 0 默认 sink 是 console 或 stderr，必须适合 REPL；后续可以增加 file sink、rotating file sink 或 OpenTelemetry sink。
- 日志 category 使用数组层级，例如 `["electrolyte", "runtime"]`、`["electrolyte", "tool", "shell"]`、`["electrolyte", "provider", providerId]`。
- 默认日志级别应保守，普通用户运行时不输出 debug/trace 噪音；debug/trace 通过 CLI flag 或 config 打开。
- 所有日志必须经过 secret redaction；不得记录 API key、env secret、provider raw auth header、完整用户文件内容或未截断的大输出。
- 结构化日志优先于拼接字符串；昂贵字段使用 lazy evaluation 或先检查 level。

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
}
```

SDK adapter 负责：

- `Effect.runPromise` 转 Promise。
- Effect stream / Queue 转 AsyncIterable。
- 将 typed errors 映射成 `AgentError` 或 rejected promise。

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

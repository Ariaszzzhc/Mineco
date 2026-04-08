import { mkdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { honoLogger } from "@logtape/hono";
import { configure, getConsoleSink } from "@logtape/logtape";
import {
  PricingDB,
  type ProviderMeta,
  ProviderRegistry,
} from "@mineco/provider";
import { Hono } from "hono";
import { contextStorage } from "hono/context-storage";
import { cors } from "hono/cors";
import { type RequestIdVariables, requestId } from "hono/request-id";
import { trimTrailingSlash } from "hono/trailing-slash";
import { Kysely } from "kysely";
import { parseCoreArgs } from "./cli.js";
import type { CoreOptions } from "./cli.js";
import { ConfigService } from "./config/service.js";
import { migrateToLatest } from "./db/migrator.js";
import { tokenAuth } from "./middleware/auth.js";
import { createChatRoutes } from "./routes/chat.js";
import { createConfigRoutes } from "./routes/config.js";
import { createFsRoutes } from "./routes/fs.js";
import { createPermissionRoutes } from "./routes/permission.js";
import { createSessionRoutes } from "./routes/session.js";
import { createSkillsRoutes } from "./routes/skills.js";
import { createStatsRoutes } from "./routes/stats.js";
import { createWorkspaceRoutes } from "./routes/workspace.js";
import { PendingPermissionStore } from "./services/pending-permission-store.js";
import {
  NodeSqliteDialect,
  SessionRunManager,
  SqliteSessionNotesStore,
  SqliteSessionStore,
  SqliteUsageStore,
  SqliteWorkspaceStore,
} from "./storage/index.js";
import type { Database } from "./storage/schema.js";
import { WorktreeService } from "./storage/worktree-service.js";

type Env = {
  Variables: RequestIdVariables;
};

/** All services shared between HTTP and stdio modes. */
export interface Services {
  configService: ConfigService;
  sessionStore: SqliteSessionStore;
  sessionNotesStore: SqliteSessionNotesStore;
  workspaceStore: SqliteWorkspaceStore;
  registry: ProviderRegistry;
  getRegistryModels: () => ProviderMeta[];
  usageStore: SqliteUsageStore;
  runManager: SessionRunManager;
  permissionStore: PendingPermissionStore;
  db: Kysely<Database>;
}

export { type CoreOptions };

/**
 * Build routes with injected deps. Return type is exported as AppType for RPC client.
 */
function buildRoutes(deps: Services) {
  const app = new Hono<Env>();

  app.use(contextStorage());
  app.use(requestId());
  app.use(honoLogger());
  app.use(trimTrailingSlash());
  app.use("*", cors({ origin: "*" }));
  app.use("/api/*", tokenAuth());

  const routes = app
    .get("/api/health", (c) => c.json({ status: "ok", timestamp: Date.now() }))
    .route(
      "/api/config",
      createConfigRoutes(
        deps.configService,
        deps.getRegistryModels,
        deps.registry,
      ),
    )
    .route("/api/workspaces", createWorkspaceRoutes(deps.workspaceStore))
    .route("/api/fs", createFsRoutes())
    .route(
      "/api/sessions",
      createSessionRoutes(
        deps.sessionStore,
        deps.sessionNotesStore,
        deps.runManager,
      ),
    )
    .route(
      "/api/sessions",
      createChatRoutes(
        deps.registry,
        deps.sessionStore,
        deps.workspaceStore,
        deps.sessionNotesStore,
        deps.runManager,
        deps.permissionStore,
      ),
    )
    .route("/api/sessions", createPermissionRoutes(deps.permissionStore))
    .route("/api/stats", createStatsRoutes(deps.usageStore))
    .route("/api/skills", createSkillsRoutes());

  return routes;
}

export type AppType = ReturnType<typeof buildRoutes>;

/** Initialize all services (shared by both HTTP and stdio modes). */
async function initServices(options: CoreOptions): Promise<Services> {
  // --- Database ---
  const dataDir = options.dataDir;
  mkdirSync(dataDir, { recursive: true });
  const dbPath = resolve(dataDir, "mineco.db");

  const db = new Kysely<Database>({
    dialect: new NodeSqliteDialect(dbPath),
  });
  await migrateToLatest(db);

  const workspaceStore = new SqliteWorkspaceStore(db);
  const worktreeService = new WorktreeService();
  const sessionStore = new SqliteSessionStore(db, {
    worktreeService,
    workspaceStore,
  });
  const sessionNotesStore = new SqliteSessionNotesStore(db);

  // --- Config system ---
  const pricingDB = new PricingDB();
  const registry = new ProviderRegistry();
  const configService = new ConfigService(registry);
  await configService.initialize();

  // --- Usage tracking ---
  const usageStore = new SqliteUsageStore(db, pricingDB);
  registry.setRecorder({
    record: (providerId, model, usage, sessionId) => {
      usageStore
        .record({
          providerId,
          model,
          usage,
          ...(sessionId ? { sessionId } : {}),
        })
        .catch((e) => console.error("Failed to record usage:", e));
    },
  });

  // --- Session run management ---
  const runManager = new SessionRunManager();

  // --- Permission management ---
  const permissionStore = new PendingPermissionStore();

  return {
    configService,
    sessionStore,
    sessionNotesStore,
    workspaceStore,
    registry,
    getRegistryModels: () => registry.list(),
    usageStore,
    runManager,
    permissionStore,
    db,
  };
}

/** Run the server in HTTP mode (REST + SSE). */
async function runHttpServer(options: CoreOptions) {
  const services = await initServices(options);

  // Make auth token available to middleware via env var (backward compat)
  if (options.authToken) {
    process.env.MINECO_AUTH_TOKEN = options.authToken;
  }

  const app = buildRoutes(services);

  // --- SPA serving (web mode only) ---
  if (options.spaDir) {
    const resolvedSpaDir = resolve(options.spaDir);
    const indexHtml = readFileSync(
      resolve(resolvedSpaDir, "index.html"),
      "utf-8",
    );

    app.get("*", (c) => {
      const filePath = resolve(resolvedSpaDir, c.req.path.slice(1));
      try {
        const stats = statSync(filePath);
        if (stats.isFile()) {
          const content = readFileSync(filePath);
          const ext = filePath.split(".").pop() ?? "";
          const mimeTypes: Record<string, string> = {
            js: "application/javascript",
            css: "text/css",
            html: "text/html",
            json: "application/json",
            png: "image/png",
            jpg: "image/jpeg",
            svg: "image/svg+xml",
            ico: "image/x-icon",
            woff: "font/woff",
            woff2: "font/woff2",
            ttf: "font/ttf",
          };
          c.header(
            "Content-Type",
            mimeTypes[ext] ?? "application/octet-stream",
          );
          return c.body(content);
        }
      } catch {
        // File not found — fall through to SPA fallback
      }
      return c.html(indexHtml);
    });
  }

  serve(
    {
      fetch: app.fetch,
      port: options.port,
      hostname: options.host,
    },
    (info) => {
      console.log(
        `Server is running on http://${options.host}:${info.port}`,
      );
    },
  );
}

/** Run the server in stdio mode (JSON-RPC over stdin/stdout). Phase 2. */
async function runStdioServer(_options: CoreOptions) {
  // TODO: Phase 2 — JSON-RPC transport implementation
  console.error("stdio mode not yet implemented");
  process.exit(1);
}

async function main() {
  const options = parseCoreArgs();

  await configure({
    sinks: { console: getConsoleSink() },
    loggers: [{ category: ["hono"], sinks: ["console"], lowestLevel: "info" }],
  });

  if (options.mode === "stdio") {
    await runStdioServer(options);
  } else {
    await runHttpServer(options);
  }
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

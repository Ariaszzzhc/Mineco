import { mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { honoLogger } from "@logtape/hono";
import { configure, getConsoleSink } from "@logtape/logtape";
import { PricingDB, ProviderRegistry, type ProviderMeta } from "@mineco/provider";
import { Hono } from "hono";
import { contextStorage } from "hono/context-storage";
import { cors } from "hono/cors";
import { type RequestIdVariables, requestId } from "hono/request-id";
import { trimTrailingSlash } from "hono/trailing-slash";
import { Kysely } from "kysely";
import { ConfigService } from "./config/service.js";
import { tokenAuth } from "./middleware/auth.js";
import { createChatRoutes } from "./routes/chat.js";
import { createConfigRoutes } from "./routes/config.js";
import { createFsRoutes } from "./routes/fs.js";
import { createSessionRoutes } from "./routes/session.js";
import { createStatsRoutes } from "./routes/stats.js";
import { createWorkspaceRoutes } from "./routes/workspace.js";
import {
  NodeSqliteDialect,
  SqliteSessionStore,
  SqliteUsageStore,
  SqliteWorkspaceStore,
} from "./storage/index.js";
import { type Database, initializeSchema } from "./storage/schema.js";

type Env = {
  Variables: RequestIdVariables;
};

/**
 * Build routes with injected deps. Return type is exported as AppType for RPC client.
 */
function buildRoutes(deps: {
  configService: ConfigService;
  getRegistryModels: () => ProviderMeta[];
  sessionStore: SqliteSessionStore;
  workspaceStore: SqliteWorkspaceStore;
  registry: ProviderRegistry;
  usageStore: SqliteUsageStore;
}) {
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
    .route("/api/sessions", createSessionRoutes(deps.sessionStore))
    .route(
      "/api/sessions",
      createChatRoutes(deps.registry, deps.sessionStore, deps.workspaceStore),
    )
    .route("/api/stats", createStatsRoutes(deps.usageStore));

  return routes;
}

export type AppType = ReturnType<typeof buildRoutes>;

async function main() {
  await configure({
    sinks: { console: getConsoleSink() },
    loggers: [{ category: ["hono"], sinks: ["console"], lowestLevel: "info" }],
  });

  // --- Database ---
  const dataDir = join(homedir(), ".mineco");
  mkdirSync(dataDir, { recursive: true });
  const dbPath = join(dataDir, "mineco.db");

  const db = new Kysely<Database>({
    dialect: new NodeSqliteDialect(dbPath),
  });
  await initializeSchema(db);

  const sessionStore = new SqliteSessionStore(db);
  const workspaceStore = new SqliteWorkspaceStore(db);

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

  // --- Routes ---
  const app = buildRoutes({
    configService,
    getRegistryModels: () => registry.list(),
    sessionStore,
    workspaceStore,
    registry,
    usageStore,
  });

  const port = parseInt(process.env.MINECO_PORT ?? "3000", 10);
  const host = process.env.MINECO_HOST ?? "127.0.0.1";

  // --- SPA serving (web mode only) ---
  const spaDir = process.env.MINECO_SPA_DIR;
  if (spaDir) {
    const resolvedSpaDir = resolve(spaDir);
    const indexHtml = readFileSync(join(resolvedSpaDir, "index.html"), "utf-8");

    app.get("*", (c) => {
      const filePath = join(resolvedSpaDir, c.req.path);
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
      port,
      hostname: host,
    },
    (info) => {
      console.log(`Server is running on http://${host}:${info.port}`);
    },
  );
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

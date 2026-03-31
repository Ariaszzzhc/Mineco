import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { configure, getConsoleSink } from "@logtape/logtape";
import { honoLogger } from "@logtape/hono";
import { contextStorage } from "hono/context-storage";
import { requestId, type RequestIdVariables } from "hono/request-id";
import { trimTrailingSlash } from "hono/trailing-slash";
import { Kysely } from "kysely";
import { ProviderRegistry } from "@mineco/provider";
import { ConfigService } from "./config/service.js";
import { createConfigRoutes } from "./routes/config.js";
import { createSessionRoutes } from "./routes/session.js";
import { createChatRoutes } from "./routes/chat.js";
import { createWorkspaceRoutes } from "./routes/workspace.js";
import { createFsRoutes } from "./routes/fs.js";
import { NodeSqliteDialect, SqliteSessionStore, SqliteWorkspaceStore } from "./storage/index.js";
import { initializeSchema, type Database } from "./storage/schema.js";
import { tokenAuth } from "./middleware/auth.js";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { mkdirSync, readFileSync, statSync } from "node:fs";

type Env = {
  Variables: RequestIdVariables;
};

/**
 * Build routes with injected deps. Return type is exported as AppType for RPC client.
 */
function buildRoutes(deps: {
  configService: ConfigService;
  getRegistryModels: () => Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }>;
  sessionStore: SqliteSessionStore;
  workspaceStore: SqliteWorkspaceStore;
  registry: ProviderRegistry;
}) {
  const app = new Hono<Env>();

  app.use(contextStorage());
  app.use(requestId());
  app.use(honoLogger());
  app.use(trimTrailingSlash());
  app.use("/api/*", tokenAuth());

  const routes = app
    .get("/", (c) => c.text("Mineco server is running"))
    .get("/api/health", (c) => c.json({ status: "ok", timestamp: Date.now() }))
    .route("/api/config", createConfigRoutes(deps.configService, deps.getRegistryModels))
    .route("/api/workspaces", createWorkspaceRoutes(deps.workspaceStore))
    .route("/api/fs", createFsRoutes())
    .route("/api/sessions", createSessionRoutes(deps.sessionStore))
    .route("/api/sessions", createChatRoutes(deps.registry, deps.sessionStore, deps.workspaceStore));

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
  const registry = new ProviderRegistry();
  const configService = new ConfigService(registry);
  await configService.initialize();

  // --- Routes ---
  const app = buildRoutes({
    configService,
    getRegistryModels: () => registry.list(),
    sessionStore,
    workspaceStore,
    registry,
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
          c.header("Content-Type", mimeTypes[ext] ?? "application/octet-stream");
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

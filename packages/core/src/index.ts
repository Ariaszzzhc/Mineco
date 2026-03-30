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
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

async function main() {
  type Env = {
    Variables: RequestIdVariables & Record<string, string>;
  };

  await configure({
    sinks: { console: getConsoleSink() },
    loggers: [{ category: ["hono"], sinks: ["console"], lowestLevel: "info" }],
  });

  const app = new Hono<Env>();

  app.use(contextStorage());
  app.use(requestId());
  app.use(honoLogger());
  app.use(trimTrailingSlash());

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
  app.route("/api/config", createConfigRoutes(configService, () => registry.list()));
  app.route("/api/workspaces", createWorkspaceRoutes(workspaceStore));
  app.route("/api/fs", createFsRoutes());
  app.route("/api/sessions", createSessionRoutes(sessionStore));
  app.route("/api/sessions", createChatRoutes(registry, sessionStore, workspaceStore));

  app.get("/", (c) => {
    return c.text("Mineco server is running");
  });

  app.get("/api/health", (c) => {
    return c.json({ status: "ok", timestamp: Date.now() });
  });

  const port = parseInt(process.env.MINECO_PORT ?? "3000", 10);

  serve(
    {
      fetch: app.fetch,
      port,
    },
    (info) => {
      console.log(`Server is running on http://localhost:${info.port}`);
    },
  );
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

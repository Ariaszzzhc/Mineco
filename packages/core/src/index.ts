import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { configure, getConsoleSink } from "@logtape/logtape";
import { honoLogger } from "@logtape/hono";
import { contextStorage } from "hono/context-storage";
import { requestId, type RequestIdVariables } from "hono/request-id";
import { trimTrailingSlash } from "hono/trailing-slash";
import { ProviderRegistry } from "@mineco/provider";
import { ConfigService } from "./config/service.js";
import { createConfigRoutes } from "./routes/config.js";

type Env = {
  Variables: RequestIdVariables & Record<string, string>; // TODO: Maybe change in future. Record<string, string> is not type safe
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

// --- Config system ---
const registry = new ProviderRegistry();
const configService = new ConfigService(registry);
await configService.initialize();

app.route("/api/config", createConfigRoutes(configService));

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);

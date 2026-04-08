import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

export interface CoreOptions {
  mode: "http" | "stdio";
  port: number;
  host: string;
  authToken?: string;
  spaDir?: string;
  dataDir: string;
}

/**
 * Parse core server CLI arguments.
 *
 * CLI args take precedence over environment variables (which remain as
 * fallbacks during migration).
 */
export function parseCoreArgs(): CoreOptions {
  const { values } = parseArgs({
    options: {
      stdio: { type: "boolean", default: false },
      port: { type: "string" },
      host: { type: "string" },
      "auth-token": { type: "string" },
      "spa-dir": { type: "string" },
      "data-dir": { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });

  const authToken = values["auth-token"] ?? process.env.MINECO_AUTH_TOKEN;

  return {
    mode: values.stdio ? "stdio" : "http",
    port: parseInt(values.port ?? process.env.MINECO_PORT ?? "3000", 10),
    host: values.host ?? process.env.MINECO_HOST ?? "127.0.0.1",
    authToken,
    spaDir: values["spa-dir"] ?? process.env.MINECO_SPA_DIR,
    dataDir: values["data-dir"] ?? join(homedir(), ".mineco"),
  };
}

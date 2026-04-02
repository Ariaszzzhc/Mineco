import { exec } from "node:child_process";
import { z } from "zod";
import { defineTool } from "./define.js";

const BashSchema = z.object({
  command: z.string().describe("Shell command to execute"),
  timeout: z
    .number()
    .optional()
    .describe("Timeout in milliseconds (default 120000)"),
});

export const bashTool = defineTool({
  name: "bash",
  description:
    "Execute a shell command and return its output. Use for system commands and operations that require shell execution.",
  parameters: BashSchema,
  isConcurrencySafe: () => false,
  execute: async (params, ctx) => {
    if (!params.command?.trim()) {
      return { output: "Error: No command provided.", isError: true };
    }

    return new Promise((resolve) => {
      exec(
        params.command,
        {
          cwd: ctx.workingDir,
          timeout: params.timeout ?? 120000,
          maxBuffer: 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (error) {
            const output =
              stderr ||
              error.message ||
              `Exit code: ${error.code ?? "unknown"}`;
            resolve({ output: output.trim(), isError: true });
            return;
          }

          const parts = [stdout.trim(), stderr.trim()].filter(Boolean);
          resolve({
            output: parts.join("\n") || "(no output)",
          });
        },
      );
    });
  },
});

import { readdir, stat } from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import { defineTool } from "./define.js";
import type { ToolResult } from "./types.js";

const MAX_FILES = 100;

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "target",
  "__pycache__",
  ".venv",
  "venv",
  "env",
  ".cache",
  ".idea",
  ".vscode",
  ".zig-cache",
  "zig-out",
  "coverage",
  ".coverage",
  "vendor",
  "tmp",
  "temp",
  "logs",
  "bin",
  "obj",
]);

const LsSchema = z.object({
  path: z
    .string()
    .optional()
    .describe("The directory to list. Defaults to the current working directory."),
});

export const lsTool = defineTool({
  name: "ls",
  description:
    "List directory contents in a tree-like structure. Automatically ignores common directories like node_modules, .git, etc.",
  parameters: LsSchema,
  execute: async (params, ctx): Promise<ToolResult> => {
    const dirPath = params.path
      ? path.isAbsolute(params.path)
        ? params.path
        : path.join(ctx.workingDir, params.path)
      : ctx.workingDir;

    // Validate directory exists
    try {
      const s = await stat(dirPath);
      if (!s.isDirectory()) {
        return { output: `Error: ${dirPath} is not a directory`, isError: true };
      }
    } catch {
      return {
        output: `Error: Directory not found: ${dirPath}`,
        isError: true,
      };
    }

    const files: string[] = [];
    let truncated = false;

    async function walk(dir: string, prefix: string): Promise<string> {
      if (files.length >= MAX_FILES) {
        truncated = true;
        return "";
      }

      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return "";
      }

      const dirs: string[] = [];
      const regularFiles: string[] = [];

      for (const entry of entries) {
        if (entry.name.startsWith(".") || IGNORE_DIRS.has(entry.name)) continue;

        if (entry.isDirectory()) {
          dirs.push(entry.name);
        } else if (entry.isFile()) {
          regularFiles.push(entry.name);
        }
      }

      // Sort: dirs and files alphabetically
      dirs.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      regularFiles.sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase()),
      );

      let output = "";

      // Render directories first
      for (const dirName of dirs) {
        if (files.length >= MAX_FILES) {
          truncated = true;
          break;
        }
        files.push(dirName);
        output += `${prefix}  ${dirName}/\n`;
        const subDir = path.join(dir, dirName);
        output += await walk(subDir, `${prefix}  `);
      }

      // Then files
      for (const fileName of regularFiles) {
        if (files.length >= MAX_FILES) {
          truncated = true;
          break;
        }
        files.push(fileName);
        output += `${prefix}  ${fileName}\n`;
      }

      return output;
    }

    const tree = await walk(dirPath, "");
    let output = `${dirPath}/\n${tree}`;

    if (truncated) {
      output += `\n(Results truncated: showing first ${MAX_FILES} entries. Use a more specific path.)`;
    }

    output += `\n(${files.length} entries)`;

    return { output };
  },
});

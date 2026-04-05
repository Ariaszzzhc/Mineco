import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import { defineTool } from "./define.js";
import type { ToolResult } from "./types.js";

const MAX_RESULTS = 100;

const GlobSchema = z.object({
  pattern: z
    .string()
    .describe("The glob pattern to match files against (e.g. '**/*.ts')"),
  path: z
    .string()
    .optional()
    .describe(
      "The directory to search in. Defaults to the current working directory.",
    ),
});

export const globTool = defineTool({
  name: "glob",
  description:
    "Find files matching a glob pattern. Returns file paths sorted by modification time.",
  parameters: GlobSchema,
  isConcurrencySafe: () => true,
  execute: async (params, ctx): Promise<ToolResult> => {
    if (!params.pattern?.trim()) {
      return { output: "Error: No glob pattern provided.", isError: true };
    }

    const searchPath = params.path
      ? path.isAbsolute(params.path)
        ? params.path
        : path.join(ctx.workingDir, params.path)
      : ctx.workingDir;

    const rgAvailable = await checkRgAvailable();
    if (rgAvailable) {
      return globWithRg(params.pattern, searchPath);
    }
    return globWithFastGlob(params.pattern, searchPath);
  },
});

async function globWithRg(
  pattern: string,
  searchPath: string,
): Promise<ToolResult> {
  const args = ["--files", "--no-messages", "--glob", pattern, searchPath];

  const output = await new Promise<string>((resolve) => {
    execFile("rg", args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
      if (error && error.code === 1) {
        resolve("");
        return;
      }
      resolve(stdout ?? "");
    });
  });

  const files = output.trim().split(/\r?\n/).filter(Boolean);
  return formatResults(files);
}

async function globWithFastGlob(
  pattern: string,
  searchPath: string,
): Promise<ToolResult> {
  try {
    const fg = await import("fast-glob");
    const entries = await fg.glob(pattern, {
      cwd: searchPath,
      absolute: true,
      onlyFiles: true,
      ignore: ["**/node_modules/**", "**/.git/**"],
    });
    return formatResults(entries as string[]);
  } catch {
    // fast-glob not available, fallback to manual walk
    return globWithWalk(pattern, searchPath);
  }
}

async function globWithWalk(
  pattern: string,
  searchPath: string,
): Promise<ToolResult> {
  const files: string[] = [];
  // Convert glob pattern to a simple regex for basic matching
  const regex = globToRegex(pattern);
  await walk(searchPath, regex, files);
  return formatResults(files);
}

async function walk(
  dir: string,
  regex: RegExp,
  files: string[],
): Promise<void> {
  if (files.length >= MAX_RESULTS * 2) return;

  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await walk(full, regex, files);
    } else if (entry.isFile()) {
      const relative = path.relative(dir, full);
      if (regex.test(full) || regex.test(relative) || regex.test(entry.name)) {
        files.push(full);
      }
    }
  }
}

function globToRegex(pattern: string): RegExp {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\{\{GLOBSTAR\}\}/g, ".*");
  try {
    return new RegExp(regexStr);
  } catch {
    return /.*/;
  }
}

async function formatResults(files: string[]): Promise<ToolResult> {
  // Sort by modification time (newest first)
  const withMtime = await Promise.all(
    files.map(async (f) => {
      try {
        const s = await stat(f);
        return { path: f, mtime: s.mtimeMs };
      } catch {
        return { path: f, mtime: 0 };
      }
    }),
  );
  withMtime.sort((a, b) => b.mtime - a.mtime);

  const truncated = withMtime.length > MAX_RESULTS;
  const finalFiles = truncated ? withMtime.slice(0, MAX_RESULTS) : withMtime;

  if (finalFiles.length === 0) {
    return { output: "No files found" };
  }

  const outputLines = finalFiles.map((f) => f.path);

  if (truncated) {
    outputLines.push("");
    outputLines.push(
      `(Results truncated: showing first ${MAX_RESULTS} of ${withMtime.length} files. Use a more specific path or pattern.)`,
    );
  }

  outputLines.push("");
  outputLines.push(`(${withMtime.length} files found)`);

  return { output: outputLines.join("\n") };
}

let _rgAvailable: boolean | null = null;

async function checkRgAvailable(): Promise<boolean> {
  if (_rgAvailable !== null) return _rgAvailable;
  return new Promise((resolve) => {
    execFile("rg", ["--version"], (error) => {
      _rgAvailable = !error;
      resolve(_rgAvailable);
    });
  });
}

import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import { defineTool } from "./define.js";
import type { ToolResult } from "./types.js";

const MAX_MATCHES = 100;
const MAX_LINE_LENGTH = 2000;

const GrepSchema = z.object({
  pattern: z
    .string()
    .describe("The regex pattern to search for in file contents"),
  path: z
    .string()
    .optional()
    .describe(
      "The directory to search in. Defaults to the current working directory.",
    ),
  include: z
    .string()
    .optional()
    .describe(
      'File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")',
    ),
});

export const grepTool = defineTool({
  name: "grep",
  description:
    "Search file contents using a regex pattern. Returns matching lines with file paths and line numbers.",
  parameters: GrepSchema,
  isConcurrencySafe: () => true,
  execute: async (params, ctx): Promise<ToolResult> => {
    if (!params.pattern?.trim()) {
      return { output: "Error: No search pattern provided.", isError: true };
    }

    const searchPath = params.path
      ? path.isAbsolute(params.path)
        ? params.path
        : path.join(ctx.workingDir, params.path)
      : ctx.workingDir;

    const rgAvailable = await checkRgAvailable();

    if (rgAvailable) {
      return grepWithRg(params.pattern, params.include, searchPath);
    }
    return grepWithNode(params.pattern, params.include, searchPath);
  },
});

async function grepWithRg(
  pattern: string,
  include: string | undefined,
  searchPath: string,
): Promise<ToolResult> {
  const args = [
    "-nH",
    "--no-messages",
    "--field-match-separator",
    "|",
    "--regexp",
    pattern,
  ];
  if (include) {
    args.push("--glob", include);
  }
  args.push(searchPath);

  const output = await new Promise<string>((resolve) => {
    execFile("rg", args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
      if (error && error.code === 1) {
        resolve("");
        return;
      }
      resolve(stdout ?? "");
    });
  });

  const lines = output.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return { output: "No files found" };
  }

  const matches: MatchEntry[] = [];
  for (const line of lines) {
    const [filePath, lineNumStr, ...lineTextParts] = line.split("|");
    if (!filePath || !lineNumStr || lineTextParts.length === 0) continue;

    const lineNum = parseInt(lineNumStr, 10);
    const lineText = lineTextParts.join("|");

    let modTime = 0;
    try {
      modTime = (await stat(filePath)).mtimeMs;
    } catch {
      // skip
    }

    matches.push({ filePath, lineNum, lineText, modTime });
  }

  return formatMatches(matches);
}

async function grepWithNode(
  pattern: string,
  include: string | undefined,
  searchPath: string,
): Promise<ToolResult> {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "i");
  } catch {
    return {
      output: `Error: Invalid regex pattern: ${pattern}`,
      isError: true,
    };
  }

  const matches: MatchEntry[] = [];
  await walkDir(searchPath, regex, include, matches);
  return formatMatches(matches);
}

async function walkDir(
  dir: string,
  regex: RegExp,
  include: string | undefined,
  matches: MatchEntry[],
): Promise<void> {
  if (matches.length >= MAX_MATCHES * 2) return;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await walkDir(full, regex, include, matches);
    } else if (entry.isFile()) {
      if (include && !globMatch(entry.name, include)) continue;

      try {
        const content = await readFile(full, "utf-8");
        const lines = content.split("\n");
        let modTime = 0;
        try {
          modTime = (await stat(full)).mtimeMs;
        } catch {
          // skip
        }

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!;
          if (regex.test(line)) {
            matches.push({
              filePath: full,
              lineNum: i + 1,
              lineText: line,
              modTime,
            });
          }
        }
      } catch {
        // skip unreadable files
      }
    }
  }
}

interface MatchEntry {
  filePath: string;
  lineNum: number;
  lineText: string;
  modTime: number;
}

function formatMatches(matches: MatchEntry[]): ToolResult {
  matches.sort((a, b) => b.modTime - a.modTime);

  const truncated = matches.length > MAX_MATCHES;
  const finalMatches = truncated ? matches.slice(0, MAX_MATCHES) : matches;

  if (finalMatches.length === 0) {
    return { output: "No files found" };
  }

  const outputLines = [
    `Found ${matches.length} matches${truncated ? ` (showing first ${MAX_MATCHES})` : ""}`,
  ];

  let currentFile = "";
  for (const match of finalMatches) {
    if (currentFile !== match.filePath) {
      if (currentFile !== "") outputLines.push("");
      currentFile = match.filePath;
      outputLines.push(`${match.filePath}:`);
    }
    const text =
      match.lineText.length > MAX_LINE_LENGTH
        ? `${match.lineText.substring(0, MAX_LINE_LENGTH)}...`
        : match.lineText;
    outputLines.push(`  Line ${match.lineNum}: ${text}`);
  }

  if (truncated) {
    outputLines.push("");
    outputLines.push(
      `(Results truncated: showing ${MAX_MATCHES} of ${matches.length} matches. Use a more specific path or pattern.)`,
    );
  }

  return { output: outputLines.join("\n") };
}

/** Simple glob match supporting common patterns like "*.ts", "*.{ts,tsx}" */
function globMatch(name: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  try {
    return new RegExp(`^${regexStr}$`).test(name);
  } catch {
    return false;
  }
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

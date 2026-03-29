import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { defineTool } from "./define.js";

const ReadFileSchema = z.object({
  file_path: z.string().describe("Absolute or relative path to the file"),
  offset: z.number().optional().describe("Line number to start reading from"),
  limit: z.number().optional().describe("Number of lines to read"),
});

export const readFileTool = defineTool({
  name: "read_file",
  description:
    "Read a file from the local filesystem. Returns file contents with line numbers.",
  parameters: ReadFileSchema,
  execute: async (params, ctx) => {
    if (!params.file_path?.trim()) {
      return { output: "Error: No file path provided.", isError: true };
    }

    const filePath = path.isAbsolute(params.file_path)
      ? params.file_path
      : path.join(ctx.workingDir, params.file_path);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");
      const totalLines = lines.length;

      const offset = params.offset ?? 1;
      const limit = params.limit ?? 2000;

      const startLine = Math.max(1, offset);
      const endLine = Math.min(totalLines, startLine + limit - 1);

      const selectedLines = lines.slice(startLine - 1, endLine);
      const numbered = selectedLines
        .map((line, i) => `${startLine + i}\t${line}`)
        .join("\n");

      return {
        output: numbered + `\n\n(total ${totalLines} lines)`,
      };
    } catch (error) {
      return {
        output: `Error reading file: ${error instanceof Error ? error.message : "Unknown error"}`,
        isError: true,
      };
    }
  },
});

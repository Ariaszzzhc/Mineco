import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import { defineTool } from "./define.js";

const WriteFileSchema = z.object({
  file_path: z.string().describe("Absolute or relative path to the file"),
  content: z.string().describe("Content to write"),
});

export const writeFileTool = defineTool({
  name: "write_file",
  description: "Create or overwrite a file with the given content.",
  parameters: WriteFileSchema,
  isConcurrencySafe: () => false,
  execute: async (params, ctx) => {
    if (!params.file_path?.trim()) {
      return { output: "Error: No file path provided.", isError: true };
    }

    const filePath = path.isAbsolute(params.file_path)
      ? params.file_path
      : path.join(ctx.workingDir, params.file_path);

    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, params.content, "utf-8");
      return { output: `Successfully wrote to ${filePath}` };
    } catch (error) {
      return {
        output: `Error writing file: ${error instanceof Error ? error.message : "Unknown error"}`,
        isError: true,
      };
    }
  },
});

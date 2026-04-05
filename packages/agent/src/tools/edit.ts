import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import { defineTool } from "./define.js";
import type { ToolResult } from "./types.js";

const EditSchema = z.object({
  file_path: z
    .string()
    .describe("Absolute or relative path to the file to modify"),
  old_string: z.string().describe("The text to find and replace"),
  new_string: z
    .string()
    .describe(
      "The text to replace it with (must be different from old_string)",
    ),
  replace_all: z
    .boolean()
    .optional()
    .describe("Replace all occurrences of old_string (default false)"),
});

export const editTool = defineTool({
  name: "edit",
  description:
    "Edit an existing file by replacing specific text. More precise than write_file for modifying existing code.",
  parameters: EditSchema,
  isConcurrencySafe: () => false,
  execute: async (params, ctx): Promise<ToolResult> => {
    if (!params.file_path?.trim()) {
      return { output: "Error: No file path provided.", isError: true };
    }

    if (params.old_string === params.new_string) {
      return {
        output: "Error: old_string and new_string are identical.",
        isError: true,
      };
    }

    const filePath = path.isAbsolute(params.file_path)
      ? params.file_path
      : path.join(ctx.workingDir, params.file_path);

    // Handle creating new file when old_string is empty
    if (params.old_string === "") {
      try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, params.new_string, "utf-8");
        return { output: `Successfully created ${filePath}` };
      } catch (error) {
        return {
          output: `Error creating file: ${error instanceof Error ? error.message : "Unknown error"}`,
          isError: true,
        };
      }
    }

    // Read existing file
    let content: string;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch (error) {
      return {
        output: `Error reading file: ${error instanceof Error ? error.message : "Unknown error"}`,
        isError: true,
      };
    }

    // Normalize line endings for matching
    const normalizedContent = normalizeLineEndings(content);
    const oldNormalized = normalizeLineEndings(params.old_string);
    const newNormalized = normalizeLineEndings(params.new_string);
    const lineEnding = detectLineEnding(content);

    // Find occurrences
    const count = countOccurrences(normalizedContent, oldNormalized);

    if (count === 0) {
      return {
        output:
          "Error: old_string not found in file. Make sure the text matches exactly, including whitespace and indentation.",
        isError: true,
      };
    }

    if (count > 1 && !params.replace_all) {
      return {
        output: `Error: Found ${count} occurrences of old_string. Provide more surrounding context to make the match unique, or set replace_all to true.`,
        isError: true,
      };
    }

    // Perform replacement
    let newContent: string;
    if (params.replace_all) {
      newContent = normalizedContent.replaceAll(oldNormalized, newNormalized);
    } else {
      newContent = normalizedContent.replace(oldNormalized, newNormalized);
    }

    // Restore original line endings
    newContent = convertLineEndings(newContent, lineEnding);

    // Write back
    try {
      await fs.writeFile(filePath, newContent, "utf-8");
    } catch (error) {
      return {
        output: `Error writing file: ${error instanceof Error ? error.message : "Unknown error"}`,
        isError: true,
      };
    }

    const replaced = params.replace_all ? count : 1;
    const diffPreview = buildDiffPreview(
      params.old_string,
      params.new_string,
      replaced,
    );

    return {
      output: `Successfully edited ${filePath} (replaced ${replaced} occurrence${replaced > 1 ? "s" : ""})\n${diffPreview}`,
    };
  },
});

function normalizeLineEndings(text: string): string {
  return text.replaceAll("\r\n", "\n");
}

function detectLineEnding(text: string): "\n" | "\r\n" {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function convertLineEndings(text: string, ending: "\n" | "\r\n"): string {
  if (ending === "\n") return text;
  return text.replaceAll("\n", "\r\n");
}

function countOccurrences(content: string, search: string): number {
  if (!search) return 0;
  let count = 0;
  let idx = content.indexOf(search);
  while (idx !== -1) {
    count++;
    idx = content.indexOf(search, idx + search.length);
  }
  return count;
}

function buildDiffPreview(
  oldStr: string,
  newStr: string,
  _count: number,
): string {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");

  const lines: string[] = [];
  for (const line of oldLines.slice(0, 5)) {
    lines.push(`- ${line}`);
  }
  if (oldLines.length > 5) {
    lines.push(`  ... (${oldLines.length - 5} more lines removed)`);
  }
  for (const line of newLines.slice(0, 5)) {
    lines.push(`+ ${line}`);
  }
  if (newLines.length > 5) {
    lines.push(`  ... (${newLines.length - 5} more lines added)`);
  }

  return lines.join("\n");
}

import { z } from 'zod';
import { defineTool, type ToolContext } from '../../../shared/tool';
import { toolRegistry } from './registry';
import * as fs from 'fs/promises';
import * as path from 'path';

const ReadFileSchema = z.object({
  file_path: z.string().describe('The absolute path to the file to read'),
  offset: z.number().optional().describe('Line number to start reading from'),
  limit: z.number().optional().describe('Number of lines to read'),
});

export const readFileTool = defineTool({
  name: 'read_file',
  description:
    'Read a file from the local filesystem. Returns file contents with line numbers.',
  parameters: ReadFileSchema,
  execute: async (
    params: z.infer<typeof ReadFileSchema>,
    context: ToolContext
  ) => {
    try {
      const filePath = path.isAbsolute(params.file_path)
        ? params.file_path
        : path.join(context.workingDir, params.file_path);

      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      const offset = params.offset ?? 1;
      const limit = params.limit ?? lines.length;

      const selectedLines = lines.slice(offset - 1, offset - 1 + limit);
      const numberedContent = selectedLines
        .map((line, idx) => `${offset + idx}\t${line}`)
        .join('\n');

      return {
        success: true,
        output: numberedContent,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

toolRegistry.register(readFileTool);

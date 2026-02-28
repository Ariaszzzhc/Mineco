import { z } from 'zod';
import { defineTool, type ToolContext } from '../../../shared/tool';
import { toolRegistry } from './registry';
import * as fs from 'fs/promises';
import * as path from 'path';

const ListDirSchema = z.object({
  path: z.string().describe('The absolute path to the directory to list'),
});

export const listDirTool = defineTool({
  name: 'list_dir',
  description: 'List contents of a directory.',
  parameters: ListDirSchema,
  execute: async (
    params: z.infer<typeof ListDirSchema>,
    context: ToolContext
  ) => {
    try {
      const dirPath = path.isAbsolute(params.path)
        ? params.path
        : path.join(context.workingDir, params.path);

      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const lines = entries.map((entry) => {
        const prefix = entry.isDirectory() ? '📁 ' : '📄 ';
        return `${prefix}${entry.name}`;
      });

      return {
        success: true,
        output: lines.join('\n') || '(empty directory)',
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

toolRegistry.register(listDirTool);

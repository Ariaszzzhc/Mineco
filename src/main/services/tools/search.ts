import { z } from 'zod';
import { defineTool, type ToolContext } from '../../../shared/tool';
import { toolRegistry } from './registry';
import { glob } from 'glob';
import * as path from 'path';

const SearchFileSchema = z.object({
  pattern: z.string().describe('Glob pattern to search for files'),
  path: z
    .string()
    .optional()
    .describe('Directory to search in (defaults to working directory)'),
});

export const searchFileTool = defineTool({
  name: 'search_file',
  description: 'Search for files matching a glob pattern.',
  parameters: SearchFileSchema,
  execute: async (
    params: z.infer<typeof SearchFileSchema>,
    context: ToolContext
  ) => {
    try {
      const searchPath = params.path
        ? path.isAbsolute(params.path)
          ? params.path
          : path.join(context.workingDir, params.path)
        : context.workingDir;

      const files = await glob(params.pattern, {
        cwd: searchPath,
        nodir: true,
      });

      if (files.length === 0) {
        return {
          success: true,
          output: 'No files found matching pattern.',
        };
      }

      return {
        success: true,
        output: files.slice(0, 100).join('\n'),
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

toolRegistry.register(searchFileTool);

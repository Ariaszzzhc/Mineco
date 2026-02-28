import { z } from 'zod';
import { defineTool, type ToolContext } from '../../../shared/tool';
import { toolRegistry } from './registry';
import * as fs from 'fs/promises';
import * as path from 'path';

const WriteFileSchema = z.object({
  file_path: z.string().describe('The absolute path to the file to write'),
  content: z.string().describe('The content to write to the file'),
});

export const writeFileTool = defineTool({
  name: 'write_file',
  description:
    'Write content to a file. Creates the file if it does not exist, overwrites if it does.',
  parameters: WriteFileSchema,
  execute: async (
    params: z.infer<typeof WriteFileSchema>,
    context: ToolContext
  ) => {
    try {
      const filePath = path.isAbsolute(params.file_path)
        ? params.file_path
        : path.join(context.workingDir, params.file_path);

      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(filePath, params.content, 'utf-8');

      return {
        success: true,
        output: `File written successfully: ${filePath}`,
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

toolRegistry.register(writeFileTool);

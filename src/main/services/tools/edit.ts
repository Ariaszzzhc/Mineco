import { z } from 'zod';
import { defineTool, type ToolContext } from '../../../shared/tool';
import { toolRegistry } from './registry';
import * as fs from 'fs/promises';
import * as path from 'path';

const EditFileSchema = z.object({
  file_path: z.string().describe('The absolute path to the file to edit'),
  old_string: z.string().describe('The text to replace'),
  new_string: z.string().describe('The text to replace it with'),
  replace_all: z
    .boolean()
    .optional()
    .describe('Replace all occurrences (default false)'),
});

export const editFileTool = defineTool({
  name: 'edit_file',
  description:
    'Edit a file by replacing specific text. Use this for making targeted changes to existing files.',
  parameters: EditFileSchema,
  execute: async (
    params: z.infer<typeof EditFileSchema>,
    context: ToolContext
  ) => {
    try {
      const filePath = path.isAbsolute(params.file_path)
        ? params.file_path
        : path.join(context.workingDir, params.file_path);

      const content = await fs.readFile(filePath, 'utf-8');

      if (!content.includes(params.old_string)) {
        return {
          success: false,
          output: '',
          error: `Text not found in file: "${params.old_string.slice(0, 50)}..."`,
        };
      }

      const newContent = params.replace_all
        ? content.split(params.old_string).join(params.new_string)
        : content.replace(params.old_string, params.new_string);

      await fs.writeFile(filePath, newContent, 'utf-8');

      return {
        success: true,
        output: `File edited successfully: ${filePath}`,
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

toolRegistry.register(editFileTool);

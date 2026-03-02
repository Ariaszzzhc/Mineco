import { z } from 'zod';
import { defineTool, type ToolContext } from '../../../shared/tool';
import { toolRegistry } from './registry';
import { createLogger } from '../logger';

const log = createLogger('shutdown_teammate');

const ShutdownTeammateSchema = z.object({
  teammate_name: z.string().describe('Name of the teammate to shutdown'),
});

interface ShutdownTeammateManagerInterface {
  shutdownTeammate(teammateId: string): Promise<void>;
  listTeammates(sessionId?: string): Promise<Array<{ id: string; name: string }>>;
}

let teammateManager: ShutdownTeammateManagerInterface | null = null;

export function setShutdownTeammateManager(manager: ShutdownTeammateManagerInterface) {
  teammateManager = manager;
}

export const shutdownTeammateTool = defineTool({
  name: 'shutdown_teammate',
  description: `Shutdown a teammate when their task is complete and no longer needed.

Use this tool when:
- A teammate has completed their assigned work
- The team is being disbanded
- A teammate is no longer needed

After shutdown:
- The teammate will stop processing any pending tasks
- Their conversation history will be lost
- They will be removed from the team`,
  parameters: ShutdownTeammateSchema,
  execute: async (
    params: z.infer<typeof ShutdownTeammateSchema>,
    _context: ToolContext
  ) => {
    if (!teammateManager) {
      return {
        success: false,
        output: 'Error: Teammate manager not available',
        error: 'Teammate manager not initialized',
      };
    }

    try {
      // Find teammate by name
      const teammates = await teammateManager.listTeammates();
      const teammate = teammates.find(t => t.name === params.teammate_name);

      if (!teammate) {
        return {
          success: false,
          output: `Error: Teammate "${params.teammate_name}" not found`,
          error: 'Teammate not found',
        };
      }

      await teammateManager.shutdownTeammate(teammate.id);

      log.info(`Shutdown teammate: ${params.teammate_name} (${teammate.id})`);

      return {
        success: true,
        output: `Teammate "${params.teammate_name}" has been shutdown successfully.`,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error('Failed to shutdown teammate:', errorMsg);
      return {
        success: false,
        output: `Failed to shutdown teammate: ${errorMsg}`,
        error: errorMsg,
      };
    }
  },
});

toolRegistry.register(shutdownTeammateTool);

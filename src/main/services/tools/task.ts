import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { defineTool, type ToolContext } from '../../../shared/tool';
import { toolRegistry } from './registry';
import { AgentExecutor } from '../agent/executor';
import { SUBAGENT_CONFIGS, type SubagentType } from '../../../shared/agent-types';
import type { ProviderConfig } from '../../../shared/types';
import { createLogger } from '../logger';

const log = createLogger('task');

const TaskSchema = z.object({
  subagent_type: z.enum(['explore', 'general', 'plan']).describe('Type of subagent to use'),
  description: z.string().describe('Brief description of the task (5-10 words)'),
  prompt: z.string().describe('Detailed task description for the subagent'),
});

let getProviderConfig: (() => ProviderConfig | null) | null = null;

export function setGetProviderConfig(fn: () => ProviderConfig | null) {
  getProviderConfig = fn;
}

export const taskTool = defineTool({
  name: 'task',
  description: `Launch a specialized subagent to handle complex tasks. The subagent has an independent context and returns a summary after completion.

Use this tool for:
- Code exploration and research (explore type)
- General coding tasks (general type)
- Planning and architecture analysis (plan type)

The subagent will execute the task and return a summary without polluting the main context.`,
  parameters: TaskSchema,
  execute: async (
    params: z.infer<typeof TaskSchema>,
    context: ToolContext
  ) => {
    if (!getProviderConfig) {
      return {
        success: false,
        output: 'Error: Provider config not available',
        error: 'Provider config not set',
      };
    }

    const providerConfig = getProviderConfig();
    if (!providerConfig) {
      return {
        success: false,
        output: 'Error: No provider configured',
        error: 'No provider configured',
      };
    }

    const subagentConfig = SUBAGENT_CONFIGS[params.subagent_type as SubagentType];
    if (!subagentConfig) {
      return {
        success: false,
        output: `Error: Unknown subagent type: ${params.subagent_type}`,
        error: 'Unknown subagent type',
      };
    }

    const sessionId = context.sessionId || uuidv4();
    const subagentId = uuidv4();

    log.info(`Starting subagent [${params.subagent_type}] for task: ${params.description}`);

    const systemPrompt = `${subagentConfig.systemPrompt}

<env>
  Working directory: ${context.workingDir}
  Task: ${params.description}
</env>`;

    const executor = new AgentExecutor({
      provider: providerConfig,
      systemPrompt,
      allowedTools: subagentConfig.allowedTools,
      workingDir: context.workingDir,
      sessionId,
      agentId: subagentId,
      isSubagent: true,
      maxSteps: 30,
    });

    const userMessage = {
      id: uuidv4(),
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: params.prompt }],
      createdAt: Date.now(),
    };

    try {
      const result = await executor.execute([userMessage]);

      log.info(`Subagent [${params.subagent_type}] completed: ${params.description}`);

      return {
        success: true,
        output: `Subagent task completed.\n\n${result.finalText}`,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error('Subagent error:', errorMsg);
      return {
        success: false,
        output: `Subagent task failed: ${errorMsg}`,
        error: errorMsg,
      };
    }
  },
});

toolRegistry.register(taskTool);

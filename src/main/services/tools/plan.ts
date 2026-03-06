import { z } from 'zod';
import { defineTool, type ToolContext } from '../../../shared/tool';
import { toolRegistry } from './registry';
import { IPC_CHANNELS } from '../../../shared/ipc';
import type { Plan, PlanBlock, PlanDecision } from '../../../shared/types';
import type { BrowserWindow } from 'electron';
import { createLogger } from '../logger';

const log = createLogger('plan_tool');

export class PlanCancelledError extends Error {
  constructor() {
    super('The plan was cancelled');
    this.name = 'PlanCancelledError';
  }
}

interface PendingPlan {
  resolve: (decision: PlanDecision) => void;
  reject: (error: Error) => void;
}

const pendingPlans = new Map<string, PendingPlan>();

let mainWindow: BrowserWindow | null = null;

export function setPlanWindow(window: BrowserWindow): void {
  mainWindow = window;
}

export function resolvePlanDecision(planId: string, decision: PlanDecision): void {
  const pending = pendingPlans.get(planId);
  if (pending) {
    pending.resolve(decision);
    pendingPlans.delete(planId);
  }
}

export function cancelPendingPlans(): void {
  for (const [, { reject }] of pendingPlans) {
    reject(new PlanCancelledError());
  }
  pendingPlans.clear();
}

function parsePlanBlocks(markdown: string): PlanBlock[] {
  const lines = markdown.split('\n');
  const blocks: PlanBlock[] = [];
  let blockId = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.match(/^#{1,6}\s/)) {
      const match = line.match(/^(#{1,6})\s/);
      const level = match ? match[1].length : 1;
      blocks.push({
        id: `block-${blockId++}`,
        type: 'heading',
        content: line,
        order: blocks.length,
        lineStart: i,
        lineEnd: i,
        level,
      });
      i++;
    } else if (line.startsWith('```')) {
      const start = i;
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({
        id: `block-${blockId++}`,
        type: 'code',
        content: lines.slice(start, i).join('\n'),
        order: blocks.length,
        lineStart: start,
        lineEnd: i - 1,
      });
    } else if (line.startsWith('>')) {
      const start = i;
      while (i < lines.length && lines[i].startsWith('>')) {
        i++;
      }
      blocks.push({
        id: `block-${blockId++}`,
        type: 'blockquote',
        content: lines.slice(start, i).join('\n'),
        order: blocks.length,
        lineStart: start,
        lineEnd: i - 1,
      });
    } else if (line.match(/^[\s]*[-*+]\s/) || line.match(/^[\s]*\d+\.\s/)) {
      blocks.push({
        id: `block-${blockId++}`,
        type: 'list-item',
        content: line,
        order: blocks.length,
        lineStart: i,
        lineEnd: i,
      });
      i++;
    } else if (line.trim() === '') {
      i++;
    } else {
      const start = i;
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !lines[i].match(/^#{1,6}\s/) &&
        !lines[i].startsWith('```') &&
        !lines[i].startsWith('>') &&
        !lines[i].match(/^[\s]*[-*+]\s/) &&
        !lines[i].match(/^[\s]*\d+\.\s/)
      ) {
        i++;
      }
      blocks.push({
        id: `block-${blockId++}`,
        type: 'paragraph',
        content: lines.slice(start, i).join('\n'),
        order: blocks.length,
        lineStart: start,
        lineEnd: i - 1,
      });
    }
  }

  return blocks;
}

const ExitPlanModeSchema = z.object({
  plan: z.string().describe('The implementation plan in Markdown format'),
  summary: z.string().describe('A brief summary of the plan (1-2 sentences)'),
});

export const exitPlanModeTool = defineTool({
  name: 'exit_plan_mode',
  description: `Submit a structured implementation plan for user review and annotation. Use this tool when you have finished analyzing the codebase and are ready to present your plan. The plan should be in Markdown format with clear headings and steps. The user will be able to annotate (delete, insert, replace, comment on) individual blocks of the plan, then either approve it for execution or request revisions.`,
  parameters: ExitPlanModeSchema,
  execute: async (params: { plan: string; summary: string }, context: ToolContext) => {
    if (!mainWindow) {
      return {
        success: false,
        output: 'Error: Main window not available for plan submission',
        error: 'Main window not set',
      };
    }

    const planId = `plan-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const blocks = parsePlanBlocks(params.plan);

    const plan: Plan = {
      id: planId,
      sessionId: context.sessionId || '',
      markdown: params.plan,
      summary: params.summary,
      blocks,
      version: 1,
      createdAt: Date.now(),
    };

    try {
      const decision = await new Promise<PlanDecision>((resolve, reject) => {
        pendingPlans.set(planId, { resolve, reject });

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.PLAN_SUBMIT, plan);
        }

        log.debug('Plan submitted to renderer:', planId);
      });

      if (decision.type === 'approve') {
        const annotationSummary = decision.annotations.length > 0
          ? `\n\nUser annotations:\n${serializeAnnotations(decision.annotations)}`
          : '';

        return {
          success: true,
          output: `Plan approved by user. Execution mode: ${decision.executionMode}.${annotationSummary}\n\nProceed with implementing the plan.`,
        };
      } else {
        const annotationSummary = decision.annotations.length > 0
          ? `\n\nUser annotations on the plan:\n${serializeAnnotations(decision.annotations)}`
          : '';

        return {
          success: true,
          output: `User requested revisions to the plan.\n\nFeedback: ${decision.feedback}${annotationSummary}\n\nPlease revise the plan based on the feedback and annotations above, then call exit_plan_mode again with the updated plan.`,
        };
      }
    } catch (error) {
      if (error instanceof PlanCancelledError) {
        return {
          success: false,
          output: 'The plan was cancelled (agent stopped or session changed).',
          error: 'Plan cancelled',
        };
      }

      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error('Error in exit_plan_mode tool:', errorMsg);
      return {
        success: false,
        output: `Error: ${errorMsg}`,
        error: errorMsg,
      };
    }
  },
});

function serializeAnnotations(annotations: import('../../../shared/types').PlanAnnotation[]): string {
  return annotations.map((a) => {
    const prefix = `[${a.type.toUpperCase()}]`;
    const excerpt = a.originalText.length > 60
      ? a.originalText.slice(0, 60) + '...'
      : a.originalText;

    switch (a.type) {
      case 'delete':
        return `${prefix} Remove: "${excerpt}"`;
      case 'insert':
        return `${prefix} After "${excerpt}", insert: "${a.newText || ''}"`;
      case 'replace':
        return `${prefix} Replace "${excerpt}" with: "${a.newText || ''}"`;
      case 'comment':
        return `${prefix} On "${excerpt}": ${a.comment || ''}`;
      default:
        return `${prefix} ${excerpt}`;
    }
  }).join('\n');
}

toolRegistry.register(exitPlanModeTool);

import { z } from 'zod';
import { defineTool, type ToolContext } from '../../../shared/tool';
import { toolRegistry } from './registry';
import type { ProtocolMessageType } from '../../../shared/agent-types';
import { createLogger } from '../logger';

const log = createLogger('send_message');

const SendMessageSchema = z.object({
  recipient: z.string().describe('Name of the teammate or "lead"'),
  content: z.string().describe('Message content'),
  summary: z.string().describe('Brief summary for UI preview (5-10 words)'),
  type: z.enum(['message', 'broadcast', 'shutdown_request', 'shutdown_response', 'plan_approval_response']).optional().describe('Message type'),
});

let messageService: MessageServiceInterface | null = null;

export interface MessageServiceInterface {
  sendMessage(config: {
    from: string;
    to: string;
    content: string;
    type: ProtocolMessageType;
    summary?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }>;
  getCurrentAgentId(): string;
}

export function setMessageService(service: MessageServiceInterface) {
  messageService = service;
}

export const sendMessageTool = defineTool({
  name: 'send_message',
  description: `Send a message to a teammate or the team lead.

Use this tool to:
- Assign tasks to teammates
- Provide feedback or answers
- Request plan approvals
- Send shutdown requests

Messages are delivered to the recipient's inbox and trigger notification.`,
  parameters: SendMessageSchema,
  execute: async (
    params: z.infer<typeof SendMessageSchema>,
    context: ToolContext
  ) => {
    if (!messageService) {
      return {
        success: false,
        output: 'Error: Message service not available',
        error: 'Message service not initialized',
      };
    }

    const messageType: ProtocolMessageType = params.type || 'message';

    try {
      const result = await messageService.sendMessage({
        from: context.agentId || messageService.getCurrentAgentId(),
        to: params.recipient,
        content: params.content,
        type: messageType,
        summary: params.summary,
      });

      if (result.success) {
        log.info(`Message sent to ${params.recipient}: ${params.summary}`);
        return {
          success: true,
          output: `Message sent to ${params.recipient}.`,
        };
      } else {
        return {
          success: false,
          output: `Failed to send message: ${result.error}`,
          error: result.error,
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error('Failed to send message:', errorMsg);
      return {
        success: false,
        output: `Failed to send message: ${errorMsg}`,
        error: errorMsg,
      };
    }
  },
});

toolRegistry.register(sendMessageTool);

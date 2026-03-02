import { z } from 'zod';
import { defineTool, type ToolContext } from '../../../shared/tool';
import { toolRegistry } from './registry';
import type { AgentMessage } from '../../../shared/agent-types';
import { createLogger } from '../logger';

const log = createLogger('read_inbox');

const ReadInboxSchema = z.object({});

let inboxService: InboxServiceInterface | null = null;

export interface InboxServiceInterface {
  readInbox(agentId: string): AgentMessage[];
  markAsRead(agentId: string, messageIds: string[]): void;
}

export function setInboxService(service: InboxServiceInterface) {
  inboxService = service;
}

export const readInboxTool = defineTool({
  name: 'read_inbox',
  description: `Read all pending messages from your inbox.

Returns a list of messages including:
- Task assignments
- Feedback from lead
- Shutdown requests
- Plan approval responses

After reading, messages remain in the inbox until explicitly cleared.`,
  parameters: ReadInboxSchema,
  execute: async (
    _params: z.infer<typeof ReadInboxSchema>,
    context: ToolContext
  ) => {
    if (!inboxService) {
      return {
        success: false,
        output: 'Error: Inbox service not available',
        error: 'Inbox service not initialized',
      };
    }

    const agentId = context.agentId;
    if (!agentId) {
      return {
        success: false,
        output: 'Error: No agent context',
        error: 'Missing agent ID',
      };
    }

    try {
      const messages = inboxService.readInbox(agentId);

      if (messages.length === 0) {
        return {
          success: true,
          output: 'Inbox is empty.',
        };
      }

      const formattedMessages = messages.map(msg => {
        const from = msg.from === 'lead' ? 'Team Lead' : msg.from;
        let content = `[${new Date(msg.timestamp).toISOString()}] From: ${from}\nType: ${msg.type}\n\n${msg.content}`;

        if (msg.metadata) {
          content += `\n\nMetadata: ${JSON.stringify(msg.metadata, null, 2)}`;
        }

        return content;
      }).join('\n\n---\n\n');

      log.info(`Read ${messages.length} messages from inbox`);

      return {
        success: true,
        output: `You have ${messages.length} message(s):\n\n${formattedMessages}`,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      log.error('Failed to read inbox:', errorMsg);
      return {
        success: false,
        output: `Failed to read inbox: ${errorMsg}`,
        error: errorMsg,
      };
    }
  },
});

toolRegistry.register(readInboxTool);

import { v4 as uuidv4 } from 'uuid';
import { createActor, type Actor } from 'xstate';
import { teammateMachine, type TeammateContext, type TeammateEvent } from './state-machine';
import { AgentExecutor } from './executor';
import type { ProviderConfig } from '../../../shared/types';
import type {
  AgentState,
  AgentMessage,
  TeamConfig,
  ProtocolMessageType,
} from '../../../shared/agent-types';
import type { Message } from '../../../shared/types';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../../shared/ipc';
import { createLogger } from '../logger';

const log = createLogger('TeammateManager');

interface TeammateInstance {
  id: string;
  name: string;
  role: string;
  actor: Actor<typeof teammateMachine>;
  executor: AgentExecutor | null;
  config: {
    systemPrompt: string;
    allowedTools: string[];
    workingDir: string;
    leadSessionId: string;
  };
  inbox: AgentMessage[];
  status: AgentState['status'];
  conversationHistory: Message[];  // Conversation history for UI display
}

class TeammateManager {
  private teams: Map<string, TeamConfig> = new Map();
  private teammates: Map<string, TeammateInstance> = new Map();
  private providerConfig: ProviderConfig | null = null;
  private mainWindow: BrowserWindow | null = null;

  setProviderConfig(config: ProviderConfig) {
    this.providerConfig = config;
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  async spawnTeammate(config: {
    name: string;
    role: string;
    systemPrompt: string;
    allowedTools: string[];
    workingDir: string;
    leadSessionId: string;
  }): Promise<{ id: string; status: string }> {
    if (!this.providerConfig) {
      throw new Error('No provider configured');
    }

    const id = uuidv4();

    const initialContext: TeammateContext = {
      id,
      name: config.name,
      inbox: [],
    };

    const actor = createActor(teammateMachine, {
      context: initialContext,
    });

    actor.subscribe((snapshot) => {
      const instance = this.teammates.get(id);
      if (instance) {
        const statusMap: Record<string, AgentState['status']> = {
          idle: 'idle',
          running: 'running',
          processing: 'idle',
          shutting_down: 'waiting',
          shutdown: 'shutdown',
        };
        instance.status = statusMap[snapshot.value as string] || 'idle';
        this.notifyTeammateEvent('status_changed', { id, status: instance.status });
      }
    });

    actor.start();

    const instance: TeammateInstance = {
      id,
      name: config.name,
      role: config.role,
      actor,
      executor: null,
      config: {
        systemPrompt: config.systemPrompt,
        allowedTools: config.allowedTools,
        workingDir: config.workingDir,
        leadSessionId: config.leadSessionId,
      },
      inbox: [],
      status: 'idle',
      conversationHistory: [],
    };

    this.teammates.set(id, instance);

    let team = this.teams.get(config.leadSessionId);
    if (!team) {
      team = {
        leadSessionId: config.leadSessionId,
        workspacePath: config.workingDir,
        members: [],
        createdAt: Date.now(),
      };
      this.teams.set(config.leadSessionId, team);
    }

    team.members.push({
      id,
      name: config.name,
      type: 'teammate',
      status: 'idle',
      role: config.role,
      inbox: [],
      createdAt: Date.now(),
    });

    log.info(`Spawned teammate: ${config.name} (${id})`);
    this.notifyTeammateEvent('spawned', { id, name: config.name, role: config.role });

    return { id, status: 'idle' };
  }

  async sendMessage(config: {
    from: string;
    to: string;
    content: string;
    type: ProtocolMessageType;
    summary?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const message: AgentMessage = {
      id: uuidv4(),
      timestamp: Date.now(),
      from: config.from,
      to: config.to,
      type: config.type,
      content: config.content,
      metadata: config.summary ? { summary: config.summary } : undefined,
    };

    if (config.to === 'lead') {
      this.notifyTeammateEvent('message_to_lead', message);
      return { success: true, messageId: message.id };
    }

    const instance = this.findTeammateByName(config.to);
    if (!instance) {
      return { success: false, error: `Teammate "${config.to}" not found` };
    }

    instance.inbox.push(message);
    instance.actor.send({ type: 'MESSAGE_RECEIVED', message });

    log.info(`Message sent to ${config.to}: ${config.summary || message.content.slice(0, 50)}`);
    this.notifyTeammateEvent('message_sent', { to: config.to, message });

    if (instance.status === 'idle') {
      this.processInbox(instance);
    }

    return { success: true, messageId: message.id };
  }

  readInbox(agentId: string): AgentMessage[] {
    const instance = this.teammates.get(agentId);
    if (!instance) {
      return [];
    }
    return [...instance.inbox];
  }

  getTeammateState(teammateId: string): AgentState | undefined {
    const instance = this.teammates.get(teammateId);
    if (!instance) return undefined;

    return {
      id: instance.id,
      name: instance.name,
      type: 'teammate',
      status: instance.status,
      role: instance.role,
      inbox: instance.inbox,
      createdAt: instance.inbox[0]?.timestamp || Date.now(),
      hasHistory: instance.conversationHistory.length > 0,
      messageCount: instance.conversationHistory.length,
    };
  }

  getConversation(teammateId: string): Message[] {
    const instance = this.teammates.get(teammateId);
    if (!instance) return [];
    return [...instance.conversationHistory];
  }

  listTeammates(sessionId?: string): AgentState[] {
    if (sessionId) {
      const team = this.teams.get(sessionId);
      return team?.members.map((m) => {
        const instance = this.teammates.get(m.id);
        return instance ? {
          ...m,
          hasHistory: instance.conversationHistory.length > 0,
          messageCount: instance.conversationHistory.length,
        } : m;
      }) || [];
    }

    return Array.from(this.teammates.values()).map((t) => ({
      id: t.id,
      name: t.name,
      type: 'teammate' as const,
      status: t.status,
      role: t.role,
      inbox: t.inbox,
      createdAt: Date.now(),
      hasHistory: t.conversationHistory.length > 0,
      messageCount: t.conversationHistory.length,
    }));
  }

  async shutdownTeammate(teammateId: string): Promise<void> {
    const instance = this.teammates.get(teammateId);
    if (!instance) return;

    instance.actor.send({ type: 'SHUTDOWN_REQUEST', requestId: uuidv4() });

    if (instance.executor) {
      instance.executor.abort();
    }

    instance.actor.stop();
    this.teammates.delete(teammateId);

    for (const [sessionId, team] of this.teams) {
      const index = team.members.findIndex((m) => m.id === teammateId);
      if (index >= 0) {
        team.members.splice(index, 1);
        if (team.members.length === 0) {
          this.teams.delete(sessionId);
        }
        break;
      }
    }

    log.info(`Shutdown teammate: ${instance.name} (${teammateId})`);
    this.notifyTeammateEvent('shutdown', { id: teammateId, name: instance.name });
  }

  getCurrentAgentId(): string {
    return 'lead';
  }

  private findTeammateByName(name: string): TeammateInstance | undefined {
    for (const instance of this.teammates.values()) {
      if (instance.name === name) {
        return instance;
      }
    }
    return undefined;
  }

  private async processInbox(instance: TeammateInstance) {
    if (instance.inbox.length === 0) return;

    const message = instance.inbox.shift();
    if (!message) return;

    instance.actor.send({ type: 'TASK_ASSIGNED', task: message.content });

    if (!this.providerConfig) {
      log.error('No provider configured for teammate execution');
      return;
    }

    instance.executor = new AgentExecutor({
      provider: this.providerConfig,
      systemPrompt: instance.config.systemPrompt,
      allowedTools: instance.config.allowedTools,
      workingDir: instance.config.workingDir,
      sessionId: instance.config.leadSessionId,
      agentId: instance.id,
      isSubagent: false,
    });

    // Create user message and add to history
    const userMessage: Message = {
      id: uuidv4(),
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: message.content }],
      createdAt: Date.now(),
    };
    instance.conversationHistory.push(userMessage);
    this.notifyTeammateEvent('conversation_updated', {
      id: instance.id,
      messageCount: instance.conversationHistory.length,
    });

    // Track assistant response parts during streaming
    const assistantParts: Message['parts'] = [];
    let assistantMessageId = uuidv4();

    try {
      await instance.executor.execute([userMessage], (event) => {
        // Forward stream event to UI
        this.notifyTeammateEvent('stream', { id: instance.id, event });

        // Collect parts for assistant message
        if (event.type === 'text-delta') {
          const textPart = assistantParts.find(p => p.type === 'text') as { type: 'text'; text: string } | undefined;
          if (textPart) {
            textPart.text += event.delta;
          } else {
            assistantParts.unshift({ type: 'text', text: event.delta || '' });
          }
        } else if (event.type === 'thinking-delta') {
          const thinkPart = assistantParts.find(p => p.type === 'thinking') as { type: 'thinking'; text: string } | undefined;
          if (thinkPart) {
            thinkPart.text += event.delta;
          } else {
            assistantParts.unshift({ type: 'thinking', text: event.delta || '' });
          }
        } else if (event.type === 'tool-call') {
          assistantParts.push({
            type: 'tool-call',
            toolCallId: event.toolCallId!,
            toolName: event.toolName!,
            args: event.args!,
          });
        } else if (event.type === 'tool-result') {
          assistantParts.push({
            type: 'tool-result',
            toolCallId: event.toolCallId!,
            toolName: event.toolName!,
            result: event.result,
            isError: event.isError,
          });
        } else if (event.type === 'message-start') {
          assistantMessageId = event.messageId;
        }
      });

      // Create assistant message and add to history
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant' as const,
        parts: assistantParts.length > 0 ? assistantParts : [{ type: 'text', text: 'Task completed.' }],
        createdAt: Date.now(),
      };
      instance.conversationHistory.push(assistantMessage);
      this.notifyTeammateEvent('conversation_updated', {
        id: instance.id,
        messageCount: instance.conversationHistory.length,
      });

      instance.actor.send({ type: 'TASK_COMPLETED', result: 'done' });
    } catch (error) {
      log.error(`Teammate ${instance.name} execution error:`, error);

      // Add error message to history
      const errorMessage: Message = {
        id: uuidv4(),
        role: 'assistant' as const,
        parts: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        createdAt: Date.now(),
      };
      instance.conversationHistory.push(errorMessage);
      this.notifyTeammateEvent('conversation_updated', {
        id: instance.id,
        messageCount: instance.conversationHistory.length,
      });

      instance.actor.send({ type: 'TASK_COMPLETED', result: 'error' });
    }

    if (instance.inbox.length > 0) {
      setTimeout(() => this.processInbox(instance), 100);
    }
  }

  private notifyTeammateEvent(type: string, data: unknown) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.TEAMMATE_EVENT, { type, data });
    }
  }
}

export const teammateManager = new TeammateManager();

import { setup, assign } from 'xstate';
import type { AgentMessage } from '../../../shared/agent-types';

export interface TeammateContext {
  id: string;
  name: string;
  inbox: AgentMessage[];
  currentTask?: string;
}

export type TeammateEvent =
  | { type: 'MESSAGE_RECEIVED'; message: AgentMessage }
  | { type: 'TASK_ASSIGNED'; task: string }
  | { type: 'TASK_COMPLETED'; result: string }
  | { type: 'SHUTDOWN_REQUEST'; requestId: string }
  | { type: 'SHUTDOWN_APPROVED' }
  | { type: 'SHUTDOWN_REJECTED' };

export const teammateMachine = setup({
  types: {
    context: {} as TeammateContext,
    events: {} as TeammateEvent,
  },
  actions: {
    addMessageToInbox: assign({
      inbox: ({ context, event }) => {
        if (event.type === 'MESSAGE_RECEIVED') {
          return [...context.inbox, event.message];
        }
        return context.inbox;
      },
    }),
    setCurrentTask: assign({
      currentTask: ({ event }) => {
        if (event.type === 'TASK_ASSIGNED') {
          return event.task;
        }
        return undefined;
      },
    }),
    clearCurrentTask: assign({
      currentTask: undefined,
    }),
  },
}).createMachine({
  id: 'teammate',
  initial: 'idle',
  context: {
    id: '',
    name: '',
    inbox: [],
  },
  states: {
    idle: {
      on: {
        MESSAGE_RECEIVED: {
          actions: ['addMessageToInbox'],
          target: 'processing',
        },
        TASK_ASSIGNED: {
          actions: ['setCurrentTask'],
          target: 'running',
        },
        SHUTDOWN_REQUEST: 'shutting_down',
      },
    },
    running: {
      on: {
        TASK_COMPLETED: {
          actions: ['clearCurrentTask'],
          target: 'idle',
        },
        MESSAGE_RECEIVED: {
          actions: ['addMessageToInbox'],
        },
        SHUTDOWN_REQUEST: 'shutting_down',
      },
    },
    processing: {
      on: {
        TASK_ASSIGNED: {
          actions: ['setCurrentTask'],
          target: 'running',
        },
      },
      after: {
        100: 'idle',
      },
    },
    shutting_down: {
      on: {
        SHUTDOWN_APPROVED: 'shutdown',
        SHUTDOWN_REJECTED: 'idle',
      },
    },
    shutdown: {
      type: 'final',
    },
  },
});

export type TeammateMachine = typeof teammateMachine;

// Agent types - placeholder for future agent-related type definitions
// Team/subagent types have been removed

export type AgentStatus = 'idle' | 'running' | 'waiting' | 'completed' | 'shutdown';

export interface AgentState {
  id: string;
  name: string;
  status: AgentStatus;
  createdAt: number;
}

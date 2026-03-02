// Agent types for Subagent and Teammate support

export type AgentType = 'subagent' | 'teammate';
export type AgentStatus = 'idle' | 'running' | 'waiting' | 'completed' | 'shutdown';

// Subagent predefined types
export type SubagentType = 'explore' | 'general' | 'plan';

// Protocol message types
export type ProtocolMessageType =
  | 'message'
  | 'broadcast'
  | 'shutdown_request'
  | 'shutdown_response'
  | 'plan_approval_request'
  | 'plan_approval_response';

// Base agent configuration
export interface BaseAgentConfig {
  id: string;
  name: string;
  type: AgentType;
  systemPrompt: string;
  allowedTools: string[];
  workingDir: string;
  sessionId: string;
}

// Subagent = BaseAgentConfig + one-time task
export interface SubagentConfig extends BaseAgentConfig {
  type: 'subagent';
  subagentType: SubagentType;
  task: string;
}

// Teammate = BaseAgentConfig + persistence
export interface TeammateConfig extends BaseAgentConfig {
  type: 'teammate';
  role: string;
  leadId: string;
}

// Agent message for communication
export interface AgentMessage {
  id: string;
  timestamp: number;
  from: string;
  to: string;
  type: ProtocolMessageType;
  content: string;
  metadata?: Record<string, unknown>;
}

// Agent state for tracking
export interface AgentState {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  role?: string;
  inbox: AgentMessage[];
  createdAt: number;
  // Conversation history metadata
  hasHistory?: boolean;      // Whether this agent has conversation history
  messageCount?: number;     // Number of messages in conversation history
}

// Team configuration
export interface TeamConfig {
  leadSessionId: string;
  workspacePath: string;
  members: AgentState[];
  createdAt: number;
}

// Subagent type configurations
export const SUBAGENT_CONFIGS: Record<SubagentType, {
  systemPrompt: string;
  allowedTools: string[];
}> = {
  explore: {
    systemPrompt: `You are an exploration agent specialized in codebase analysis and research.

Your capabilities:
- Search and read files to understand code structure
- Find patterns, classes, functions, and configurations
- Provide comprehensive analysis and summaries

Guidelines:
- Focus on the specific task given
- Use search and read tools efficiently
- Provide clear, concise summaries
- Don't make changes to any files

Return a well-organized summary of your findings.`,
    allowedTools: ['read_file', 'list_dir', 'search_file', 'run_shell'],
  },
  general: {
    systemPrompt: `You are a general-purpose agent for handling diverse tasks.

Your capabilities:
- Read, write, and edit files
- Execute shell commands
- Search and analyze code

Guidelines:
- Complete the task independently
- Report progress and results clearly
- Handle errors gracefully

Provide a complete summary of what was accomplished.`,
    allowedTools: ['read_file', 'write_file', 'edit_file', 'list_dir', 'search_file', 'run_shell'],
  },
  plan: {
    systemPrompt: `You are a planning agent specialized in designing implementation strategies.

Your capabilities:
- Analyze requirements and existing code
- Design implementation approaches
- Identify critical files and architectural trade-offs

Guidelines:
- Focus on architecture and design
- Return step-by-step plans
- Identify critical files and dependencies
- Consider trade-offs

Return a detailed implementation plan with clear steps.`,
    allowedTools: ['read_file', 'list_dir', 'search_file'],
  },
};

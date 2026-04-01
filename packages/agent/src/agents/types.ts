export interface AgentDefinition {
  type: string;
  description: string;
  systemPrompt: string;
  toolNames: string[];
  maxSteps: number;
}

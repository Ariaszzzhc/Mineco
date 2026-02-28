import type { ToolDefinition } from '../../shared/tool';

class ToolRegistry {
  private tools: Map<string, ToolDefinition<unknown>> = new Map();

  register(tool: ToolDefinition<unknown>): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition<unknown> | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition<unknown>[] {
    return Array.from(this.tools.values());
  }

  getToolSchemas(): Array<{
    name: string;
    description: string;
    parameters: unknown;
  }> {
    return this.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }
}

export const toolRegistry = new ToolRegistry();

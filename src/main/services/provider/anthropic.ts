import { Anthropic } from '@anthropic-ai/sdk';
import type { ProviderConfig, Message, Part } from '../../shared/types';
import type { ToolDefinition } from '../../shared/tool';
import { z } from 'zod';

export class AnthropicProvider {
  private client: Anthropic;
  private model: string;

  constructor(config: ProviderConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    this.model = config.model;
  }

  async *stream(
    messages: Message[],
    tools: ToolDefinition<unknown>[],
    systemPrompt?: string
  ): AsyncGenerator<
    | { type: 'text-delta'; delta: string }
    | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }
  > {
    // Convert messages to Anthropic format
    const anthropicMessages = messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: this.convertParts(msg.parts),
    }));

    // Convert tools to Anthropic format
    const anthropicTools = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: zodToAnthropicSchema(tool.parameters),
    }));

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 4096,
      messages: anthropicMessages,
      system: systemPrompt,
      tools: anthropicTools.length > 0 ? anthropicTools : undefined,
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield {
          type: 'text-delta',
          delta: event.delta.text,
        };
      } else if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          const block = event.content_block as Anthropic.Messages.ToolUseBlock;
          yield {
            type: 'tool-call',
            toolCallId: block.id,
            toolName: block.name,
            args: block.input,
          };
        }
      }
    }
  }

  private convertParts(parts: Part[]): Anthropic.Messages.ContentBlockParam[] {
    return parts
      .filter((p): p is TextPart => p.type === 'text')
      .map((p) => ({
        type: 'text' as const,
        text: p.text,
      }));
  }
}

function zodToAnthropicSchema(zodSchema: z.ZodSchema): Anthropic.Messages.Tool['input_schema'] {
  // Simple conversion - in production you might want more robust handling
  return zodToSchema(zodSchema);
}

function zodToSchema(zodSchema: z.ZodSchema): Record<string, unknown> {
  if (zodSchema instanceof z.ZodObject) {
    const shape = zodSchema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToSchema(value as z.ZodSchema);
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  if (zodSchema instanceof z.ZodString) {
    return { type: 'string' };
  }

  if (zodSchema instanceof z.ZodNumber) {
    return { type: 'number' };
  }

  if (zodSchema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }

  if (zodSchema instanceof z.ZodArray) {
    return { type: 'array', items: zodToSchema(zodSchema.element) };
  }

  if (zodSchema instanceof z.ZodOptional) {
    return zodToSchema(zodSchema.unwrap());
  }

  if (zodSchema instanceof z.ZodDefault) {
    return zodToSchema(zodSchema.removeDefault());
  }

  return { type: 'object' };
}

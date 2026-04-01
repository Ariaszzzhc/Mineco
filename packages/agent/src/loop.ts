import type {
  ChatRequest,
  FinishReason,
  ProviderRegistry,
  ToolCall,
  Usage,
} from "@mineco/provider";
import type { Session } from "./session/types.js";
import type { ToolRegistry } from "./tools/registry.js";
import type { AgentConfig, AgentEvent } from "./types.js";

export class AgentLoop {
  constructor(
    private providerRegistry: ProviderRegistry,
    private toolRegistry: ToolRegistry,
  ) {}

  async *run(
    session: Session,
    config: AgentConfig,
  ): AsyncGenerator<AgentEvent> {
    const provider = this.providerRegistry.get(config.providerId);

    const messages = toApiMessages(session.messages, config.systemPrompt);
    let step = 0;

    while (step < config.maxSteps) {
      step++;
      yield { type: "step", step, maxSteps: config.maxSteps };

      const request: ChatRequest = {
        model: config.model,
        messages,
        tools: this.toolRegistry.toApiTools(),
        stream: true,
      };

      let text = "";
      let thinking = "";
      const toolCallMap = new Map<number, ToolCall>();
      let finishReason: FinishReason | null = null;
      let usage: Usage | undefined;

      try {
        for await (const chunk of provider.chatStream(request)) {
          const delta = chunk.delta;

          if (delta.content) {
            text += delta.content;
            yield { type: "text-delta", delta: delta.content };
          }

          if (delta.thinking) {
            thinking += delta.thinking;
            yield { type: "thinking-delta", delta: delta.thinking };
          }

          if (delta.toolCalls) {
            for (const tc of delta.toolCalls) {
              const existing = toolCallMap.get(tc.index);
              if (existing) {
                if (tc.id) existing.id = tc.id;
                if (tc.name) existing.name = tc.name;
                if (tc.arguments) existing.arguments += tc.arguments;
              } else {
                toolCallMap.set(tc.index, {
                  id: tc.id ?? "",
                  name: tc.name ?? "",
                  arguments: tc.arguments ?? "",
                });
              }
            }
          }

          if (chunk.usage) usage = chunk.usage;
          if (chunk.finishReason) finishReason = chunk.finishReason;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        yield { type: "error", error: message };
        return;
      }

      const collectedCalls = [...toolCallMap.values()];
      messages.push({
        role: "assistant",
        content: text,
        ...(collectedCalls.length > 0 ? { toolCalls: collectedCalls } : {}),
      });

      if (usage) yield { type: "usage", usage };

      if (finishReason !== "tool_calls" || toolCallMap.size === 0) {
        yield { type: "complete", reason: "stop" };
        return;
      }

      for (const tc of collectedCalls) {
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(tc.arguments);
        } catch {
          args = {};
        }

        yield {
          type: "tool-call",
          toolCallId: tc.id,
          toolName: tc.name,
          args,
        };

        const result = await this.toolRegistry.execute(tc.name, tc.arguments, {
          workingDir: config.workingDir,
          sessionId: session.id,
          providerId: config.providerId,
          model: config.model,
          ...(config.emitEvent ? { emitEvent: config.emitEvent } : {}),
        });

        yield {
          type: "tool-result",
          toolCallId: tc.id,
          toolName: tc.name,
          result: result.output,
          isError: !!result.isError,
        };

        messages.push({
          role: "tool",
          content: result.output,
          ...(tc.id ? { toolCallId: tc.id } : {}),
        });
      }
    }

    yield { type: "complete", reason: "max-steps" };
  }
}

function toApiMessages(
  sessionMessages: Session["messages"],
  systemPrompt: string,
): ChatRequest["messages"] {
  const result: ChatRequest["messages"] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of sessionMessages) {
    switch (msg.role) {
      case "user":
        result.push({ role: "user", content: msg.content });
        break;
      case "assistant":
        result.push({
          role: "assistant",
          content: msg.content,
          ...(msg.toolCalls ? { toolCalls: msg.toolCalls } : {}),
        });
        break;
      case "tool":
        result.push({
          role: "tool",
          content: msg.content,
          ...(msg.toolCallId ? { toolCallId: msg.toolCallId } : {}),
        });
        break;
    }
  }

  return result;
}

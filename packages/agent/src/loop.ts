import type {
  ChatRequest,
  FinishReason,
  ProviderRegistry,
  ToolCall,
  Usage,
} from "@mineco/provider";
import type { Session } from "./session/types.js";
import type { ToolRegistry } from "./tools/registry.js";
import { StreamingToolExecutor } from "./tools/streaming-executor.js";
import type { AgentConfig, AgentEvent } from "./types.js";
import type { ContextManager } from "./context/manager.js";

export class AgentLoop {
  constructor(
    private providerRegistry: ProviderRegistry,
    private toolRegistry: ToolRegistry,
    private contextManager?: ContextManager,
  ) {}

  async *run(
    session: Session,
    config: AgentConfig,
  ): AsyncGenerator<AgentEvent> {
    const provider = this.providerRegistry.get(config.providerId);

    // Use ContextManager if available for compression, otherwise raw conversion
    let messages: ChatRequest["messages"];

    if (this.contextManager) {
      const result = await this.contextManager.prepareContext(
        session.id,
        session.messages,
        config.systemPrompt,
        {
          providerRegistry: this.providerRegistry,
          providerId: config.providerId,
          model: config.model,
        },
      );
      messages = result.messages;

      if (result.stats.microCompacted || result.stats.memoryExtracted) {
        yield { type: "context-compressed" as const, stats: result.stats, notes: result.notes };
      }
    } else {
      messages = toApiMessages(session.messages, config.systemPrompt);
    }
    let step = 0;

    while (step < config.maxSteps) {
      if (config.signal?.aborted) {
        yield { type: "complete", reason: "aborted" as const };
        return;
      }

      step++;
      yield { type: "step", step, maxSteps: config.maxSteps };

      const request: ChatRequest = {
        model: config.model,
        messages,
        tools: this.toolRegistry.toApiTools(),
        stream: true,
      };

      let text = "";
      const toolCallMap = new Map<number, ToolCall>();
      let finishReason: FinishReason | null = null;
      let usage: Usage | undefined;

      try {
        await this.providerRegistry.acquireRateLimit();

        for await (const chunk of provider.chatStream(request)) {
          const delta = chunk.delta;

          if (delta.content) {
            text += delta.content;
            yield { type: "text-delta", delta: delta.content };
          }

          if (delta.thinking) {
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

      if (usage) {
        this.providerRegistry.recordUsage(
          config.providerId,
          config.model,
          usage,
          session.id,
        );
        yield { type: "usage", usage };
      }

      if (finishReason !== "tool_calls" || toolCallMap.size === 0) {
        yield { type: "complete", reason: "stop" };
        return;
      }

      const executor = new StreamingToolExecutor(this.toolRegistry, {
        workingDir: config.workingDir,
        sessionId: session.id,
        providerId: config.providerId,
        model: config.model,
        ...(config.emitEvent ? { emitEvent: config.emitEvent } : {}),
        ...(config.signal ? { signal: config.signal } : {}),
      });

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

        executor.addTool(tc.id, tc.name, tc.arguments);
      }

      for await (const result of executor.getRemainingResults()) {
        yield {
          type: "tool-result",
          toolCallId: result.toolCallId,
          toolName: result.toolName,
          result: result.output,
          isError: result.isError,
        };

        messages.push({
          role: "tool",
          content: result.output,
          ...(result.toolCallId ? { toolCallId: result.toolCallId } : {}),
        });
      }

      // Check signal after tool execution
      if (config.signal?.aborted) {
        yield { type: "complete", reason: "aborted" as const };
        return;
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

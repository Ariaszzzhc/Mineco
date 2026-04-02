import { randomUUID } from "node:crypto";
import {
  AgentLoop,
  agentDefinitions,
  buildSystemPrompt,
  createAgentTool,
  createDefaultToolRegistry,
  type AgentEvent,
  type SessionMessage,
  type SessionStore,
} from "@mineco/agent";
import type { ProviderRegistry } from "@mineco/provider";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { SqliteWorkspaceStore } from "../storage/workspace-store.js";

export function createChatRoutes(
  providerRegistry: ProviderRegistry,
  store: SessionStore,
  workspaceStore: SqliteWorkspaceStore,
) {
  const tools = createDefaultToolRegistry();
  tools.register(
    createAgentTool({
      providerRegistry,
      definitions: agentDefinitions,
      sessionStore: store,
    }),
  );
  const loop = new AgentLoop(providerRegistry, tools);

  async function generateTitle(
    providerId: string,
    model: string,
    userMessage: string,
    sessionId: string,
  ): Promise<string | null> {
    try {
      const provider = providerRegistry.get(providerId);
      const response = await provider.chat({
        model,
        messages: [
          {
            role: "system",
            content:
              "Generate a concise title (max 20 chars) for a coding session. Reply with ONLY the title, no quotes or extra punctuation.",
          },
          { role: "user", content: userMessage },
        ],
      });

      if (response.usage) {
        providerRegistry.recordUsage(
          providerId,
          model,
          response.usage,
          sessionId,
        );
      }

      const title = response.message.content;
      if (typeof title === "string" && title.trim()) {
        const cleaned = title.trim().replace(/^["']|["']$/g, "");
        await store.updateTitle(sessionId, cleaned);
        return cleaned;
      }
    } catch (err) {
      console.error("[title-gen] Failed to generate title:", err);
    }
    return null;
  }

  return new Hono().post("/:id/chat", async (c) => {
    const sessionId = c.req.param("id");
    const body = await c.req.json<{
      message?: string;
      providerId?: string;
      model?: string;
    }>();

    if (!body.message?.trim()) {
      return c.json({ error: "message is required" }, 400);
    }
    if (!body.providerId || !body.model) {
      return c.json({ error: "providerId and model are required" }, 400);
    }

    const session = await store.get(sessionId);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    // Resolve working directory from workspace
    const workspace = await workspaceStore.get(session.workspaceId);
    const workingDir = workspace?.path ?? process.cwd();

    const userMsg: SessionMessage = {
      id: randomUUID(),
      role: "user",
      content: body.message,
      createdAt: Date.now(),
    };
    await store.addMessage(sessionId, userMsg);
    session.messages.push(userMsg);

    const systemPrompt = buildSystemPrompt({
      workingDir,
      platform: process.platform,
      date: new Date().toISOString().split("T")[0] ?? new Date().toDateString(),
      model: body.model!,
    });

    const isFirstMessage = session.messages.length === 1;

    return streamSSE(c, async (stream) => {
      let currentText = "";
      let currentThinking = "";
      const toolMessages: SessionMessage[] = [];

      const emitEvent = async (event: AgentEvent) => {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
        });
      };

      // Start title generation concurrently with agent loop
      const titlePromise = isFirstMessage
        ? generateTitle(
            body.providerId!,
            body.model!,
            body.message!,
            sessionId,
          )
        : null;

      try {
        for await (const event of loop.run(session, {
          providerId: body.providerId!,
          model: body.model!,
          systemPrompt,
          workingDir,
          maxSteps: 50,
          emitEvent,
        })) {
          // Subagent events are emitted directly via emitEvent callback;
          // skip them in the main loop to avoid double-write
          if (
            event.type === "subagent-start" ||
            event.type === "subagent-event" ||
            event.type === "subagent-end"
          ) {
            continue;
          }

          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event),
          });

          if (event.type === "text-delta") {
            currentText += event.delta;
          } else if (event.type === "thinking-delta") {
            currentThinking += event.delta;
          } else if (event.type === "tool-call") {
            // Tool call marks end of current assistant text
            if (currentText || currentThinking) {
              await store.addMessage(sessionId, {
                id: randomUUID(),
                role: "assistant",
                content: currentText,
                ...(currentThinking ? { thinking: currentThinking } : {}),
                createdAt: Date.now(),
              });
              currentText = "";
              currentThinking = "";
            }
          } else if (event.type === "tool-result") {
            toolMessages.push({
              id: randomUUID(),
              role: "tool",
              content: event.result,
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              isError: event.isError,
              createdAt: Date.now(),
            });
          } else if (event.type === "complete") {
            // Save any remaining tool messages
            for (const msg of toolMessages) {
              await store.addMessage(sessionId, msg);
            }
            // Save final assistant text
            if (currentText || currentThinking) {
              await store.addMessage(sessionId, {
                id: randomUUID(),
                role: "assistant",
                content: currentText,
                ...(currentThinking ? { thinking: currentThinking } : {}),
                createdAt: Date.now(),
              });
            }
          }
        }
      } catch (error) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            type: "error",
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        });
      }

      // Await title generation result and send via SSE
      if (titlePromise) {
        const title = await titlePromise;
        if (title) {
          await stream.writeSSE({
            event: "title-generated",
            data: JSON.stringify({ type: "title-generated", title }),
          });
        }
      }
    });
  });
}

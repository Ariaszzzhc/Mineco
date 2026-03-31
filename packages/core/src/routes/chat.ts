import { randomUUID } from "node:crypto";
import type { SessionStore } from "@mineco/agent";
import {
  AgentLoop,
  buildSystemPrompt,
  createDefaultToolRegistry,
  type SessionMessage,
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
  const loop = new AgentLoop(providerRegistry, tools);

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

    return streamSSE(c, async (stream) => {
      let currentText = "";
      let currentThinking = "";
      const toolMessages: SessionMessage[] = [];

      try {
        for await (const event of loop.run(session, {
          providerId: body.providerId!,
          model: body.model!,
          systemPrompt,
          workingDir,
          maxSteps: 50,
        })) {
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
    });
  });
}

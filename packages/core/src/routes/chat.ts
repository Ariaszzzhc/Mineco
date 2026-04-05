import { randomUUID } from "node:crypto";
import {
  type AgentEvent,
  AgentLoop,
  agentDefinitions,
  buildSkillCatalogText,
  buildSystemPrompt,
  ContextManager,
  createActivateSkillTool,
  createAgentTool,
  createDefaultToolRegistry,
  injectSkillCatalog,
  resolveSlashSkill,
  type SessionMessage,
  type SessionStore,
  SkillScanner,
  SkillStore,
} from "@mineco/agent";
import type { ProviderRegistry } from "@mineco/provider";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { SqliteSessionNotesStore } from "../storage/session-notes-store.js";
import type { SessionRunManager } from "../storage/session-run-manager.js";
import type { SqliteWorkspaceStore } from "../storage/workspace-store.js";

export function createChatRoutes(
  providerRegistry: ProviderRegistry,
  store: SessionStore,
  workspaceStore: SqliteWorkspaceStore,
  notesStore: SqliteSessionNotesStore,
  runManager: SessionRunManager,
) {
  const tools = createDefaultToolRegistry();
  tools.register(
    createAgentTool({
      providerRegistry,
      definitions: agentDefinitions,
      sessionStore: store,
    }),
  );

  const skillScanner = new SkillScanner();
  const skillStoreCache = new Map<string, SkillStore>();

  async function getSkillStore(workingDir: string): Promise<SkillStore> {
    const cached = skillStoreCache.get(workingDir);
    if (cached) return cached;
    const manifests = await skillScanner.scan(workingDir);
    const skillStore = new SkillStore(manifests);
    skillStoreCache.set(workingDir, skillStore);
    return skillStore;
  }

  tools.register(
    createActivateSkillTool((workingDir) => skillStoreCache.get(workingDir)),
  );

  const contextManager = new ContextManager();
  const loop = new AgentLoop(providerRegistry, tools, contextManager);

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

    // Store validated values to avoid non-null assertions
    const providerId = body.providerId;
    const model = body.model;
    const message = body.message;

    // Acquire per-session mutex to serialize requests to the same session
    const mutex = runManager.getMutex(sessionId);
    await mutex.lock();

    // Read session fresh from DB inside mutex to avoid TOCTOU race
    const session = await store.get(sessionId);
    if (!session) {
      mutex.unlock();
      return c.json({ error: "Session not found" }, 404);
    }

    // Resolve working directory from workspace
    const workspace = await workspaceStore.get(session.workspaceId);
    const workingDir = workspace?.path ?? process.cwd();

    // Resolve skills for this workspace
    const skillStore = await getSkillStore(workingDir);
    const skillCatalog = buildSkillCatalogText(skillStore);

    // Check for /skill-name syntax in user message
    let actualMessage = body.message;
    let skillInjection: string | undefined;
    const resolved = resolveSlashSkill(message, skillStore);
    if (resolved) {
      actualMessage = resolved.remaining || resolved.skill.description;
      skillInjection = `<skill-content data-name="${resolved.skill.name}">\n# Skill: ${resolved.skill.name}\n\n${resolved.skill.instructions}\n</skill-content>`;
    }

    const userMsg: SessionMessage = {
      id: randomUUID(),
      role: "user",
      content: actualMessage,
      createdAt: Date.now(),
    };
    await store.addMessage(sessionId, userMsg);
    session.messages.push(userMsg);

    let systemPrompt = buildSystemPrompt({
      workingDir,
      platform: process.platform,
      date: new Date().toISOString().split("T")[0] ?? new Date().toDateString(),
      model,
    });
    systemPrompt = injectSkillCatalog(systemPrompt, skillCatalog);

    if (skillInjection) {
      systemPrompt += `\n${skillInjection}`;
    }

    const isFirstMessage = session.messages.length === 1;

    // Register run with the manager
    const runResult = runManager.start(sessionId);
    // start() returns false only if already running, but the mutex prevents that
    if (!runResult) {
      mutex.unlock();
      return c.json({ error: "Session is already processing a request" }, 409);
    }
    const { abortController } = runResult;

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
        ? generateTitle(providerId, model, message, sessionId)
        : null;

      try {
        for await (const event of loop.run(session, {
          providerId,
          model,
          systemPrompt,
          workingDir,
          maxSteps: 50,
          emitEvent,
          signal: abortController.signal,
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
              const msg: SessionMessage = {
                id: randomUUID(),
                role: "assistant",
                content: currentText,
                ...(currentThinking ? { thinking: currentThinking } : {}),
                createdAt: Date.now(),
              };
              await store.addMessage(sessionId, msg);
              await stream.writeSSE({
                event: "message-persisted",
                data: JSON.stringify({
                  type: "message-persisted",
                  message: msg,
                }),
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
          } else if (event.type === "context-compressed") {
            // Persist extracted notes to SQLite
            if (event.notes) {
              try {
                await notesStore.upsertAutoNote(
                  sessionId,
                  JSON.stringify(event.notes),
                  event.stats.finalTokenEstimate,
                );
              } catch (err) {
                console.error(
                  "[context] Failed to persist session notes:",
                  err,
                );
              }
            }
          } else if (event.type === "complete") {
            // Save any remaining tool messages
            for (const msg of toolMessages) {
              await store.addMessage(sessionId, msg);
            }
            // Save final assistant text
            if (currentText || currentThinking) {
              const msg: SessionMessage = {
                id: randomUUID(),
                role: "assistant",
                content: currentText,
                ...(currentThinking ? { thinking: currentThinking } : {}),
                createdAt: Date.now(),
              };
              await store.addMessage(sessionId, msg);
              await stream.writeSSE({
                event: "message-persisted",
                data: JSON.stringify({
                  type: "message-persisted",
                  message: msg,
                }),
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
      } finally {
        runManager.finish(sessionId);
        mutex.unlock();
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

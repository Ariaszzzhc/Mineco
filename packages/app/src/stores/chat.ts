import { batch } from "solid-js";
import { createStore } from "solid-js/store";
import { getApiBaseUrl } from "../lib/api-base";
import { getPlatform } from "../lib/platform";
import { streamChat } from "../lib/sse-client";
import type {
  AgentEvent,
  PermissionRequestEvent,
  ToolCallEvent,
  ToolResultEvent,
} from "../lib/types";
import { configStore } from "./config";
import { sessionStore } from "./session";

export interface StreamingSegment {
  text: string;
  thinking: string;
  toolCalls: ToolCallEvent[];
  toolResults: ToolResultEvent[];
}

export interface SubagentRunState {
  runId: string;
  agentType: string;
  status: "running" | "completed" | "error";
  summary: string | null;
  streamingText: string;
  streamingThinking: string;
  streamingToolCalls: ToolCallEvent[];
  streamingToolResults: ToolResultEvent[];
  streamingSegments: StreamingSegment[];
}

interface PendingPermission {
  requestId: string;
  toolName: string;
  args: Record<string, unknown>;
  riskLevel: "read" | "write" | "execute";
  reason: string;
}

interface PerSessionStreamState {
  isStreaming: boolean;
  streamingText: string;
  streamingThinking: string;
  streamingToolCalls: ToolCallEvent[];
  streamingToolResults: ToolResultEvent[];
  streamingMessages: StreamingSegment[];
  error: string | null;
  subagentRuns: Record<string, SubagentRunState>;
  activeSubagentRunId: string | null;
  pendingPermissions: PendingPermission[];
  sessionUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

interface ChatState {
  streams: Record<string, PerSessionStreamState>;
  activeSessionId: string | null;
}

function emptyStreamState(): PerSessionStreamState {
  return {
    isStreaming: false,
    streamingText: "",
    streamingThinking: "",
    streamingToolCalls: [],
    streamingToolResults: [],
    streamingMessages: [],
    error: null,
    subagentRuns: {},
    activeSubagentRunId: null,
    pendingPermissions: [],
    sessionUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

const [state, setState] = createStore<ChatState>({
  streams: {},
  activeSessionId: null,
});

const abortControllers = new Map<string, { abort: () => void }>();

function getStream(sessionId: string): PerSessionStreamState {
  return state.streams[sessionId] ?? emptyStreamState();
}

function ensureStream(sessionId: string): void {
  if (!state.streams[sessionId]) {
    setState("streams", sessionId, emptyStreamState());
  }
}

function archiveCurrentSegment(sessionId: string) {
  const s = getStream(sessionId);
  if (
    !s.streamingText &&
    !s.streamingThinking &&
    s.streamingToolCalls.length === 0
  ) {
    return;
  }
  setState("streams", sessionId, "streamingMessages", (prev) => [
    ...prev,
    {
      text: s.streamingText,
      thinking: s.streamingThinking,
      toolCalls: [...s.streamingToolCalls],
      toolResults: [...s.streamingToolResults],
    },
  ]);
  batch(() => {
    setState("streams", sessionId, "streamingText", "");
    setState("streams", sessionId, "streamingThinking", "");
    setState("streams", sessionId, "streamingToolCalls", []);
    setState("streams", sessionId, "streamingToolResults", []);
  });
}

function archiveSubagentSegment(sessionId: string, runId: string) {
  const s = getStream(sessionId);
  const run = s.subagentRuns[runId];
  if (!run) return;
  if (
    !run.streamingText &&
    !run.streamingThinking &&
    run.streamingToolCalls.length === 0
  ) {
    return;
  }
  setState(
    "streams",
    sessionId,
    "subagentRuns",
    runId,
    "streamingSegments",
    (prev) => [
      ...prev,
      {
        text: run.streamingText,
        thinking: run.streamingThinking,
        toolCalls: [...run.streamingToolCalls],
        toolResults: [...run.streamingToolResults],
      },
    ],
  );
  batch(() => {
    setState("streams", sessionId, "subagentRuns", runId, "streamingText", "");
    setState(
      "streams",
      sessionId,
      "subagentRuns",
      runId,
      "streamingThinking",
      "",
    );
    setState(
      "streams",
      sessionId,
      "subagentRuns",
      runId,
      "streamingToolCalls",
      [],
    );
    setState(
      "streams",
      sessionId,
      "subagentRuns",
      runId,
      "streamingToolResults",
      [],
    );
  });
}

function processSubagentEvent(
  sessionId: string,
  runId: string,
  event: AgentEvent,
) {
  switch (event.type) {
    case "text-delta":
      setState(
        "streams",
        sessionId,
        "subagentRuns",
        runId,
        "streamingText",
        (prev: string) => prev + event.delta,
      );
      break;
    case "thinking-delta":
      setState(
        "streams",
        sessionId,
        "subagentRuns",
        runId,
        "streamingThinking",
        (prev: string) => prev + event.delta,
      );
      break;
    case "tool-call":
      setState(
        "streams",
        sessionId,
        "subagentRuns",
        runId,
        "streamingToolCalls",
        (prev: ToolCallEvent[]) => [...prev, event],
      );
      break;
    case "tool-result":
      setState(
        "streams",
        sessionId,
        "subagentRuns",
        runId,
        "streamingToolResults",
        (prev: ToolResultEvent[]) => [...prev, event],
      );
      break;
    case "step":
      archiveSubagentSegment(sessionId, runId);
      break;
    case "error":
      setState("streams", sessionId, "subagentRuns", runId, {
        status: "error",
        summary: event.error,
      });
      break;
  }
}

async function startStream(sessionId: string, message: string) {
  // Guard: only block if THIS specific session is already streaming
  if (abortControllers.has(sessionId)) return;

  const providerId = configStore.activeProviderId();
  const model = configStore.activeModel();

  if (!providerId || !model) {
    ensureStream(sessionId);
    setState("streams", sessionId, "error", "No provider or model configured");
    return;
  }

  ensureStream(sessionId);
  batch(() => {
    setState("streams", sessionId, {
      isStreaming: true,
      streamingText: "",
      streamingThinking: "",
      streamingToolCalls: [],
      streamingToolResults: [],
      streamingMessages: [],
      error: null,
      subagentRuns: {},
      activeSubagentRunId: null,
      sessionUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });
  });

  const { promise, abort } = streamChat(
    sessionId,
    message,
    providerId,
    model,
    (event: AgentEvent) => {
      switch (event.type) {
        case "text-delta":
          setState(
            "streams",
            sessionId,
            "streamingText",
            (prev) => prev + event.delta,
          );
          break;
        case "thinking-delta":
          setState(
            "streams",
            sessionId,
            "streamingThinking",
            (prev) => prev + event.delta,
          );
          break;
        case "tool-call":
          setState("streams", sessionId, "streamingToolCalls", (prev) => [
            ...prev,
            event,
          ]);
          break;
        case "tool-result":
          setState("streams", sessionId, "streamingToolResults", (prev) => [
            ...prev,
            event,
          ]);
          break;
        case "step":
          archiveCurrentSegment(sessionId);
          break;
        case "usage":
          setState("streams", sessionId, "sessionUsage", (prev) => ({
            promptTokens: prev.promptTokens + event.usage.promptTokens,
            completionTokens:
              prev.completionTokens + event.usage.completionTokens,
            totalTokens: prev.totalTokens + event.usage.totalTokens,
          }));
          break;
        case "title-generated":
          sessionStore.updateTitle(sessionId, event.title);
          break;
        case "error":
          setState("streams", sessionId, "error", event.error);
          break;
        case "message-persisted":
          sessionStore.addMessageToSession(sessionId, event.message);
          // Clear text+thinking that are now persisted (tools stay until complete)
          batch(() => {
            setState("streams", sessionId, "streamingText", "");
            setState("streams", sessionId, "streamingThinking", "");
          });
          break;
        case "subagent-start":
          setState("streams", sessionId, "subagentRuns", event.runId, {
            runId: event.runId,
            agentType: event.agentType,
            status: "running",
            summary: null,
            streamingText: "",
            streamingThinking: "",
            streamingToolCalls: [],
            streamingToolResults: [],
            streamingSegments: [],
          });
          break;
        case "subagent-event":
          processSubagentEvent(sessionId, event.runId, event.event);
          break;
        case "subagent-end":
          // Archive any remaining segment before marking complete
          archiveSubagentSegment(sessionId, event.runId);
          setState("streams", sessionId, "subagentRuns", event.runId, {
            status: "completed",
            summary: event.summary,
          });
          break;
        case "permission-request":
          setState("streams", sessionId, "pendingPermissions", (prev) => [
            ...prev,
            {
              requestId: event.requestId,
              toolName: event.toolName,
              args: event.args,
              riskLevel: event.riskLevel,
              reason: event.reason,
            },
          ]);
          break;
      }
    },
    undefined,
    () => {
      // User message is persisted on server — fetch it immediately
      sessionStore.refreshSession(sessionId);
    },
  );

  abortControllers.set(sessionId, { abort });

  try {
    await promise;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    setState(
      "streams",
      sessionId,
      "error",
      err instanceof Error ? err.message : "Stream failed",
    );
  } finally {
    setState("streams", sessionId, "isStreaming", false);
    abortControllers.delete(sessionId);
    // Refresh session from server to pick up persisted messages
    await sessionStore.refreshSession(sessionId);
    // Clear streaming state to avoid duplicate rendering with persisted messages
    setState("streams", sessionId, {
      streamingText: "",
      streamingThinking: "",
      streamingToolCalls: [],
      streamingToolResults: [],
      streamingMessages: [],
    });
  }
}

function stopStream(sessionId: string) {
  const handle = abortControllers.get(sessionId);
  handle?.abort();
}

function resetStreamState(sessionId: string) {
  const handle = abortControllers.get(sessionId);
  handle?.abort();
  abortControllers.delete(sessionId);
  setState("streams", sessionId, emptyStreamState());
}

function cleanupSession(sessionId: string) {
  const handle = abortControllers.get(sessionId);
  handle?.abort();
  abortControllers.delete(sessionId);
  setState("streams", sessionId, emptyStreamState());
}

function setActiveSession(id: string | null) {
  setState("activeSessionId", id);
}

function viewSubagent(sessionId: string, runId: string) {
  setState("streams", sessionId, "activeSubagentRunId", runId);
}

function exitSubagentView(sessionId: string) {
  setState("streams", sessionId, "activeSubagentRunId", null);
}

async function respondPermission(
  sessionId: string,
  requestId: string,
  decision: "allow" | "deny",
) {
  const baseUrl = getApiBaseUrl();
  const platform = getPlatform();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (platform.token) {
    headers.Authorization = `Bearer ${platform.token}`;
  }

  await fetch(`${baseUrl}/api/sessions/${sessionId}/permission`, {
    method: "POST",
    headers,
    body: JSON.stringify({ requestId, decision }),
  });

  // Remove from pending list
  setState("streams", sessionId, "pendingPermissions", (prev) =>
    prev.filter((p) => p.requestId !== requestId),
  );
}

export const chatStore = {
  // Per-session accessors
  isStreaming: (sessionId: string) => getStream(sessionId).isStreaming,
  streamingText: (sessionId: string) => getStream(sessionId).streamingText,
  streamingThinking: (sessionId: string) =>
    getStream(sessionId).streamingThinking,
  streamingToolCalls: (sessionId: string) =>
    getStream(sessionId).streamingToolCalls,
  streamingToolResults: (sessionId: string) =>
    getStream(sessionId).streamingToolResults,
  streamingMessages: (sessionId: string) =>
    getStream(sessionId).streamingMessages,
  error: (sessionId: string) => getStream(sessionId).error,
  subagentRuns: (sessionId: string) => getStream(sessionId).subagentRuns,
  activeSubagentRunId: (sessionId: string) =>
    getStream(sessionId).activeSubagentRunId,
  pendingPermissions: (sessionId: string) =>
    getStream(sessionId).pendingPermissions,
  sessionUsage: (sessionId: string) => getStream(sessionId).sessionUsage,

  // Multi-session helpers
  anyStreaming: () => Object.values(state.streams).some((s) => s.isStreaming),
  activeSessionId: () => state.activeSessionId,

  streamingSessionIds: () =>
    Object.entries(state.streams)
      .filter(([, s]) => s.isStreaming)
      .map(([id]) => id),
  // Actions
  setActiveSession,
  startStream,
  stopStream,
  resetStreamState,
  cleanupSession,
  viewSubagent,
  exitSubagentView,
  respondPermission,
};

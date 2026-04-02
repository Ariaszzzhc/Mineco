import { batch } from "solid-js";
import { createStore } from "solid-js/store";
import { streamChat } from "../lib/sse-client";
import type { AgentEvent, ToolCallEvent, ToolResultEvent } from "../lib/types";
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

interface ChatState {
  isStreaming: boolean;
  pendingUserMessage: string;
  streamingText: string;
  streamingThinking: string;
  streamingToolCalls: ToolCallEvent[];
  streamingToolResults: ToolResultEvent[];
  streamingMessages: StreamingSegment[];
  error: string | null;
  subagentRuns: Record<string, SubagentRunState>;
  activeSubagentRunId: string | null;
  sessionUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

const initialState: ChatState = {
  isStreaming: false,
  pendingUserMessage: "",
  streamingText: "",
  streamingThinking: "",
  streamingToolCalls: [],
  streamingToolResults: [],
  streamingMessages: [],
  error: null,
  subagentRuns: {},
  activeSubagentRunId: null,
  sessionUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
};

const [state, setState] = createStore<ChatState>({ ...initialState });

let currentAbort: (() => void) | null = null;

function archiveCurrentSegment() {
  if (
    !state.streamingText &&
    !state.streamingThinking &&
    state.streamingToolCalls.length === 0
  ) {
    return;
  }
  setState("streamingMessages", (prev) => [
    ...prev,
    {
      text: state.streamingText,
      thinking: state.streamingThinking,
      toolCalls: [...state.streamingToolCalls],
      toolResults: [...state.streamingToolResults],
    },
  ]);
  batch(() => {
    setState("streamingText", "");
    setState("streamingThinking", "");
    setState("streamingToolCalls", []);
    setState("streamingToolResults", []);
  });
}

function archiveSubagentSegment(runId: string) {
  const run = state.subagentRuns[runId];
  if (!run) return;
  if (
    !run.streamingText &&
    !run.streamingThinking &&
    run.streamingToolCalls.length === 0
  ) {
    return;
  }
  setState("subagentRuns", runId, "streamingSegments", (prev) => [
    ...prev,
    {
      text: run.streamingText,
      thinking: run.streamingThinking,
      toolCalls: [...run.streamingToolCalls],
      toolResults: [...run.streamingToolResults],
    },
  ]);
  batch(() => {
    setState("subagentRuns", runId, "streamingText", "");
    setState("subagentRuns", runId, "streamingThinking", "");
    setState("subagentRuns", runId, "streamingToolCalls", []);
    setState("subagentRuns", runId, "streamingToolResults", []);
  });
}

function processSubagentEvent(runId: string, event: AgentEvent) {
  switch (event.type) {
    case "text-delta":
      setState("subagentRuns", runId, "streamingText", (prev: string) => prev + event.delta);
      break;
    case "thinking-delta":
      setState("subagentRuns", runId, "streamingThinking", (prev: string) => prev + event.delta);
      break;
    case "tool-call":
      setState("subagentRuns", runId, "streamingToolCalls", (prev: ToolCallEvent[]) => [...prev, event]);
      break;
    case "tool-result":
      setState("subagentRuns", runId, "streamingToolResults", (prev: ToolResultEvent[]) => [...prev, event]);
      break;
    case "step":
      archiveSubagentSegment(runId);
      break;
    case "error":
      setState("subagentRuns", runId, {
        status: "error",
        summary: event.error,
      });
      break;
  }
}

async function startStream(sessionId: string, message: string) {
  // Guard against concurrent streams
  if (currentAbort) return;

  const providerId = configStore.activeProviderId();
  const model = configStore.activeModel();

  if (!providerId || !model) {
    setState("error", "No provider or model configured");
    return;
  }

  batch(() => {
    setState({
      isStreaming: true,
      pendingUserMessage: message,
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
          setState("streamingText", (prev) => prev + event.delta);
          break;
        case "thinking-delta":
          setState("streamingThinking", (prev) => prev + event.delta);
          break;
        case "tool-call":
          setState("streamingToolCalls", (prev) => [...prev, event]);
          break;
        case "tool-result":
          setState("streamingToolResults", (prev) => [...prev, event]);
          break;
        case "step":
          archiveCurrentSegment();
          break;
        case "usage":
          setState("sessionUsage", (prev) => ({
            promptTokens: prev.promptTokens + event.usage.promptTokens,
            completionTokens: prev.completionTokens + event.usage.completionTokens,
            totalTokens: prev.totalTokens + event.usage.totalTokens,
          }));
          break;
        case "title-generated":
          sessionStore.updateTitle(sessionId, event.title);
          break;
        case "error":
          setState("error", event.error);
          break;
        case "subagent-start":
          setState("subagentRuns", event.runId, {
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
          processSubagentEvent(event.runId, event.event);
          break;
        case "subagent-end":
          // Archive any remaining segment before marking complete
          archiveSubagentSegment(event.runId);
          setState("subagentRuns", event.runId, {
            status: "completed",
            summary: event.summary,
          });
          break;
      }
    },
  );

  currentAbort = abort;

  try {
    await promise;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    setState("error", err instanceof Error ? err.message : "Stream failed");
  } finally {
    batch(() => {
      setState({
        isStreaming: false,
        pendingUserMessage: "",
        streamingText: "",
        streamingThinking: "",
        streamingToolCalls: [],
        streamingToolResults: [],
        streamingMessages: [],
        activeSubagentRunId: null,
      });
      currentAbort = null;
    });
    await sessionStore.refreshCurrentSession();
  }
}

function stopStream() {
  // Let the finally block in startStream clean up state
  currentAbort?.();
}

function resetStreamState() {
  if (currentAbort) {
    currentAbort();
  }
  batch(() => {
    setState({
      isStreaming: false,
      pendingUserMessage: "",
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
    currentAbort = null;
  });
}

function viewSubagent(runId: string) {
  setState("activeSubagentRunId", runId);
}

function exitSubagentView() {
  setState("activeSubagentRunId", null);
}

export const chatStore = {
  isStreaming: () => state.isStreaming,
  pendingUserMessage: () => state.pendingUserMessage,
  streamingText: () => state.streamingText,
  streamingThinking: () => state.streamingThinking,
  streamingToolCalls: () => state.streamingToolCalls,
  streamingToolResults: () => state.streamingToolResults,
  streamingMessages: () => state.streamingMessages,
  error: () => state.error,
  subagentRuns: () => state.subagentRuns,
  activeSubagentRunId: () => state.activeSubagentRunId,
  sessionUsage: () => state.sessionUsage,
  startStream,
  stopStream,
  resetStreamState,
  viewSubagent,
  exitSubagentView,
};

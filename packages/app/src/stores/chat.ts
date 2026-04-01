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

interface ChatState {
  isStreaming: boolean;
  pendingUserMessage: string;
  streamingText: string;
  streamingThinking: string;
  streamingToolCalls: ToolCallEvent[];
  streamingToolResults: ToolResultEvent[];
  streamingMessages: StreamingSegment[];
  error: string | null;
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
        case "error":
          setState("error", event.error);
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
    });
    currentAbort = null;
  });
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
  startStream,
  stopStream,
  resetStreamState,
};

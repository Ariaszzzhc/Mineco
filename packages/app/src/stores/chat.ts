import { createStore } from "solid-js/store";
import { batch } from "solid-js";
import { streamChat } from "../lib/sse-client";
import type {
  AgentEvent,
  ToolCallEvent,
  ToolResultEvent,
} from "../lib/types";
import { sessionStore } from "./session";
import { configStore } from "./config";

interface ChatState {
  isStreaming: boolean;
  streamingText: string;
  streamingToolCalls: ToolCallEvent[];
  streamingToolResults: ToolResultEvent[];
  error: string | null;
}

const [state, setState] = createStore<ChatState>({
  isStreaming: false,
  streamingText: "",
  streamingToolCalls: [],
  streamingToolResults: [],
  error: null,
});

let currentAbort: (() => void) | null = null;

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
      streamingText: "",
      streamingToolCalls: [],
      streamingToolResults: [],
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
        case "tool-call":
          setState("streamingToolCalls", (prev) => [...prev, event]);
          break;
        case "tool-result":
          setState("streamingToolResults", (prev) => [...prev, event]);
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
        streamingText: "",
        streamingToolCalls: [],
        streamingToolResults: [],
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

export const chatStore = {
  isStreaming: () => state.isStreaming,
  streamingText: () => state.streamingText,
  streamingToolCalls: () => state.streamingToolCalls,
  streamingToolResults: () => state.streamingToolResults,
  error: () => state.error,
  startStream,
  stopStream,
};

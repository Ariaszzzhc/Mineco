import { contextBridge, ipcRenderer } from "electron";
import {
  AGENT_RUN_CHANNEL,
  type AgentEvent,
  agentEventChannel,
} from "../src/lib/agent-protocol";

let counter = 0;

const agent = {
  /**
   * Starts an agent run. `onEvent` fires for each streamed event. Returns an
   * unsubscribe function that detaches the listener — always call it when the
   * run is finished or the component unmounts to avoid leaks.
   */
  run(prompt: string, onEvent: (event: AgentEvent) => void): () => void {
    const id = `${Date.now()}-${counter++}`;
    const channel = agentEventChannel(id);

    const listener = (_e: Electron.IpcRendererEvent, payload: AgentEvent) => {
      onEvent(payload);
      if (payload.type === "done" || payload.type === "error") {
        ipcRenderer.removeListener(channel, listener);
      }
    };

    ipcRenderer.on(channel, listener);
    ipcRenderer.send(AGENT_RUN_CHANNEL, { id, prompt });

    return () => ipcRenderer.removeListener(channel, listener);
  },
};

contextBridge.exposeInMainWorld("agent", agent);

export type AgentApi = typeof agent;

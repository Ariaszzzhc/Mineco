import { contextBridge, ipcRenderer } from "electron";
import {
  CH,
  type Message,
  type NormalizedEvent,
  type ProfileInput,
  type ProviderProfile,
  type Session,
  turnEventChannel,
} from "../src/lib/agent-protocol";

let counter = 0;

const mineco = {
  profiles: {
    list: (): Promise<ProviderProfile[]> => ipcRenderer.invoke(CH.profilesList),
    create: (input: ProfileInput): Promise<ProviderProfile> =>
      ipcRenderer.invoke(CH.profilesCreate, input),
    update: (profile: ProviderProfile): Promise<void> =>
      ipcRenderer.invoke(CH.profilesUpdate, profile),
    remove: (id: string): Promise<void> =>
      ipcRenderer.invoke(CH.profilesDelete, id),
  },

  sessions: {
    list: (): Promise<Session[]> => ipcRenderer.invoke(CH.sessionsList),
    create: (input?: { title?: string; cwd?: string }): Promise<Session> =>
      ipcRenderer.invoke(CH.sessionsCreate, input ?? {}),
    remove: (id: string): Promise<void> =>
      ipcRenderer.invoke(CH.sessionsDelete, id),
    messages: (sessionId: string): Promise<Message[]> =>
      ipcRenderer.invoke(CH.sessionMessages, sessionId),
  },

  /**
   * Runs one turn. `onEvent` fires for each streamed event. Returns
   * `{ id, stop }`: call `stop()` to detach the listener and abort the run —
   * always call it when the run finishes or the component unmounts.
   */
  runTurn(
    req: { sessionId: string; profileId: string; prompt: string },
    onEvent: (event: NormalizedEvent) => void,
  ): { id: string; stop: () => void } {
    const id = `${Date.now()}-${counter++}`;
    const channel = turnEventChannel(id);

    const listener = (_e: unknown, payload: NormalizedEvent) => {
      onEvent(payload);
      if (payload.type === "result" || payload.type === "error") {
        ipcRenderer.removeListener(channel, listener);
      }
    };

    ipcRenderer.on(channel, listener);
    ipcRenderer.send(CH.turnRun, { id, ...req });

    return {
      id,
      stop: () => {
        ipcRenderer.removeListener(channel, listener);
        ipcRenderer.send(CH.turnAbort, id);
      },
    };
  },
};

contextBridge.exposeInMainWorld("mineco", mineco);

export type MinecoApi = typeof mineco;

/**
 * Shared IPC contract between the Electron main process (where the Claude Agent
 * SDK runs) and the renderer (Svelte). Type-only fields are erased at build
 * time; the small runtime helpers are bundled independently into each side.
 */

/** Renderer -> main: ask the agent to run a single prompt. */
export interface AgentRequest {
  /** Correlates the request with its event stream. */
  id: string;
  prompt: string;
}

/** Main -> renderer: incremental events for one request. */
export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "done"; result: string }
  | { type: "error"; message: string };

/** Channel the renderer uses to start a run. */
export const AGENT_RUN_CHANNEL = "agent:run";

/** Per-request channel the main process streams events back on. */
export function agentEventChannel(id: string): string {
  return `agent:event:${id}`;
}

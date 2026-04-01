import type { AgentDefinition } from "./types.js";
import { exploreAgent } from "./explore.js";

export const agentDefinitions = new Map<string, AgentDefinition>([
  [exploreAgent.type, exploreAgent],
]);

export type { AgentDefinition } from "./types.js";

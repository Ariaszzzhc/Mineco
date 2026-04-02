import { exploreAgent } from "./explore.js";
import { planAgent } from "./plan.js";
import type { AgentDefinition } from "./types.js";
import { verificationAgent } from "./verification.js";

export const agentDefinitions = new Map<string, AgentDefinition>([
  [exploreAgent.type, exploreAgent],
  [planAgent.type, planAgent],
  [verificationAgent.type, verificationAgent],
]);

export type { AgentDefinition } from "./types.js";

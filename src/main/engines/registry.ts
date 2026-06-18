import type { EngineId } from "@/shared/agent-protocol";
import { claudeEngine } from "./claude";
import type { Engine } from "./types";

/** Engine registry. v1 is Claude-only; the abstraction keeps a roadmap slot for
 * a future engine (a new adapter registers itself here). */
const ENGINES: Record<EngineId, Engine> = {
  claude: claudeEngine,
};

export function getEngine(id: EngineId): Engine {
  const engine = ENGINES[id];
  if (!engine) throw new Error(`Unknown engine: ${id}`);
  return engine;
}

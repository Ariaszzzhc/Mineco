import type { EngineId } from "../../src/lib/agent-protocol";
import { claudeEngine } from "./claude";
import { codexEngine } from "./codex";
import type { Engine } from "./types";

const ENGINES: Record<EngineId, Engine> = {
  claude: claudeEngine,
  codex: codexEngine,
};

export function getEngine(id: EngineId): Engine {
  const engine = ENGINES[id];
  if (!engine) throw new Error(`Unknown engine: ${id}`);
  return engine;
}

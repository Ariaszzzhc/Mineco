import type {
  Appearance,
  EngineId,
  McpServer,
  MemoryEntry,
  Message,
  RunMode,
  Session,
  Skill,
  TurnRecord,
} from "../../src/lib/agent-protocol";

/**
 * The Kysely table model. Columns are declared in camelCase here; the
 * `CamelCasePlugin` (see `index.ts`) maps them to the snake_case columns in
 * SQLite and back, so query builders and result rows stay camelCase. Table
 * keys are likewise camelCase (`memoryEntries` -> `memory_entries`).
 */

interface AgentsTable {
  id: string;
  name: string;
  engine: EngineId;
  baseUrl: string;
  apiKey: string;
  /** JSON-serialized `{ sonnet; opus; haiku }`. */
  modelsJson: string;
  model: string;
  effort: "low" | "medium" | "high";
  systemPrompt: string;
  promptMode: "append" | "replace";
  createdAt: number;
}

interface WorkspacesTable {
  id: string;
  name: string;
  path: string;
  createdAt: number;
}

interface SessionsTable {
  id: string;
  workspaceId: string | null;
  title: string;
  cwd: string;
  status: Session["status"];
  createdAt: number;
}

interface TurnsTable {
  id: string;
  sessionId: string;
  agentId: string;
  engine: EngineId;
  mode: RunMode;
  model: string;
  nativeThreadId: string | null;
  /** JSON-serialized `NormalizedUsage`, or null until the turn finishes. */
  usageJson: string | null;
  status: TurnRecord["status"];
  createdAt: number;
}

interface MessagesTable {
  id: string;
  sessionId: string;
  turnId: string;
  role: Message["role"];
  content: string;
  /** Concatenated reasoning text for the turn. */
  reasoning: string;
  /** JSON-serialized `ToolRecord[]`. */
  tools: string;
  engine: EngineId | null;
  createdAt: number;
}

interface MemoryEntriesTable {
  id: string;
  workspaceId: string;
  kind: MemoryEntry["kind"];
  text: string;
  createdAt: number;
}

interface McpServersTable {
  id: string;
  name: string;
  transport: McpServer["transport"];
  scope: McpServer["scope"];
  /** SQLite has no bool — stored as 0/1. */
  enabled: number;
  command: string;
  env: string;
  createdAt: number;
}

interface SkillsTable {
  id: string;
  name: string;
  description: string;
  scope: Skill["scope"];
  source: string;
  enabled: number;
  createdAt: number;
}

interface AppSettingsTable {
  /** Singleton row, always `'default'`. */
  id: string;
  /** JSON-serialized `Appearance`. */
  appearanceJson: string;
}

export type { Appearance };

export interface Database {
  agents: AgentsTable;
  workspaces: WorkspacesTable;
  sessions: SessionsTable;
  turns: TurnsTable;
  messages: MessagesTable;
  memoryEntries: MemoryEntriesTable;
  mcpServers: McpServersTable;
  skills: SkillsTable;
  appSettings: AppSettingsTable;
}

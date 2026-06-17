import type { Message } from "../../src/lib/agent-protocol";

/**
 * The Kysely table model. mineco.db holds ONLY runtime state — the EXACTLY four
 * tables below (workspaces / sessions / turns / messages). Agents, MCP, skills,
 * memory, and app settings are filesystem-backed (see EDD §4.1) and have no
 * table here.
 *
 * Columns are declared in camelCase; the `CamelCasePlugin` (see `index.ts`)
 * maps them to the snake_case columns in SQLite and back, so query builders and
 * result rows stay camelCase. Table keys are likewise camelCase.
 */

interface WorkspacesTable {
  id: string;
  name: string;
  /** Absolute project path, or null for the public/shared workspace. */
  rootPath: string | null;
  /** Last-used run mode id (string) in this workspace. */
  lastMode: string | null;
  /** Last-used agent id in this workspace. */
  lastAgentId: string | null;
  createdAt: number;
}

interface SessionsTable {
  id: string;
  workspaceId: string | null;
  agentId: string | null;
  title: string;
  cwd: string;
  createdAt: number;
}

interface TurnsTable {
  id: string;
  sessionId: string;
  agentId: string;
  /** Run mode id (string) chosen for this turn. */
  mode: string | null;
  /** Human-readable label for the run mode at the time of the turn. */
  modeLabel: string | null;
  model: string | null;
  nativeThreadId: string | null;
  /** JSON-serialized `NormalizedUsage`, or null until the turn finishes. */
  usageJson: string | null;
  status: string;
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
  engine: string | null;
  createdAt: number;
}

export interface Database {
  workspaces: WorkspacesTable;
  sessions: SessionsTable;
  turns: TurnsTable;
  messages: MessagesTable;
}

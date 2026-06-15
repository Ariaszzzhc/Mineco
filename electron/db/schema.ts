import type {
  EngineId,
  Message,
  TurnRecord,
} from "../../src/lib/agent-protocol";

/**
 * The Kysely table model. Columns are declared in camelCase here; the
 * `CamelCasePlugin` (see `index.ts`) maps them to the snake_case columns in
 * SQLite and back, so query builders and result rows stay camelCase. Table
 * keys are likewise camelCase (`providerProfiles` -> `provider_profiles`).
 */

interface ProviderProfilesTable {
  id: string;
  name: string;
  engine: EngineId;
  model: string;
  apiKey: string;
  baseUrl: string;
  createdAt: number;
}

interface SessionsTable {
  id: string;
  title: string;
  cwd: string;
  createdAt: number;
}

interface TurnsTable {
  id: string;
  sessionId: string;
  profileId: string;
  engine: EngineId;
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
  engine: EngineId | null;
  createdAt: number;
}

export interface Database {
  providerProfiles: ProviderProfilesTable;
  sessions: SessionsTable;
  turns: TurnsTable;
  messages: MessagesTable;
}

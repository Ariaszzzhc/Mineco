import type {
  Session,
  SessionMessage,
  AppConfig,
  AppSettings,
  ZhipuProviderConfig,
  OpenAICompatProviderConfig,
} from "../../src/lib/types";

export function createTestSession(overrides?: Partial<Session>): Session {
  return {
    id: "test-session-id",
    title: "Test Session",
    workspaceId: "test-workspace-id",
    messages: [],
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

export function createTestMessage(
  overrides?: Partial<SessionMessage>,
): SessionMessage {
  return {
    id: "msg-1",
    role: "user",
    content: "hello",
    createdAt: 1000,
    ...overrides,
  };
}

export function createTestConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    providers: [],
    settings: {},
    ...overrides,
  };
}

export function createZhipuProvider(
  overrides?: Partial<ZhipuProviderConfig>,
): ZhipuProviderConfig {
  return {
    type: "zhipu",
    apiKey: "test-api-key",
    platform: "cn",
    endpoint: "general",
    ...overrides,
  };
}

export function createOpenAIProvider(
  overrides?: Partial<OpenAICompatProviderConfig>,
): OpenAICompatProviderConfig {
  return {
    type: "openai-compatible",
    id: "test-provider",
    baseURL: "http://localhost:11434/v1",
    models: [{ id: "qwen3", name: "Qwen3" }],
    ...overrides,
  };
}

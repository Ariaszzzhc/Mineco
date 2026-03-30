import { vi } from "vitest";
import type { SessionStore, Session, SessionMessage } from "@mineco/agent";

export function createMockSessionStore(
  overrides?: Partial<SessionStore>,
): SessionStore {
  return {
    create: vi.fn(async (): Promise<Session> => ({
      id: "mock-session-id",
      title: "New Session",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })),
    get: vi.fn(async () => undefined),
    list: vi.fn(async () => []),
    addMessage: vi.fn(async () => {}),
    updateMessages: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    ...overrides,
  };
}

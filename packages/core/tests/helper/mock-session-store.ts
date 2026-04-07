import type { Session, SessionStore } from "@mineco/agent";
import { vi } from "vitest";

export function createMockSessionStore(
  overrides?: Partial<SessionStore>,
): SessionStore {
  return {
    create: vi.fn(
      async (
        workspaceId: string,
        _options?: { mode?: string; branchName?: string },
      ): Promise<Session> => ({
        id: "mock-session-id",
        title: "New Session",
        workspaceId,
        worktreePath: null,
        worktreeBranch: null,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    ),
    get: vi.fn(async () => undefined),
    list: vi.fn(async () => []),
    listByWorkspace: vi.fn(async () => []),
    addMessage: vi.fn(async () => {}),
    updateMessages: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    updateTitle: vi.fn(async () => {}),
    createRun: vi.fn(async () => {}),
    updateRun: vi.fn(async () => {}),
    getRunsBySession: vi.fn(async () => []),
    ...overrides,
  };
}

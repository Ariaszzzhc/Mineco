import { useLocation, useNavigate } from "@solidjs/router";
import { ArrowLeft, Plus, Settings, Trash2 } from "lucide-solid";
import { createEffect, For, on, Show } from "solid-js";
import { api } from "../../lib/api-client";
import type { Session } from "../../lib/types";
import { sessionStore } from "../../stores/session";
import { workspaceStore } from "../../stores/workspace";

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  // Extract workspace ID from route
  const workspaceId = () => {
    const match = location.pathname.match(/^\/workspaces\/([^/]+)/);
    return match?.[1];
  };

  // Extract session ID from route
  const currentSessionId = () => {
    const match = location.pathname.match(
      /^\/workspaces\/[^/]+\/sessions\/(.+)$/,
    );
    return match?.[1];
  };

  const workspace = () => workspaceStore.currentWorkspace();

  // Reload sessions when workspace ID changes
  createEffect(
    on(workspaceId, (wid) => {
      if (wid) {
        sessionStore.loadSessions(wid);
      }
    }),
  );

  async function handleCreate() {
    const wid = workspaceId();
    if (!wid) return;
    try {
      const session = await api.createSession(wid);
      sessionStore.addSession(session);
      navigate(`/workspaces/${wid}/sessions/${session.id}`);
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  }

  async function handleDelete(e: Event, id: string) {
    e.stopPropagation();
    try {
      await api.deleteSession(id);
      sessionStore.removeSession(id);
      if (currentSessionId() === id) {
        const wid = workspaceId();
        if (wid) navigate(`/workspaces/${wid}`);
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  }

  return (
    <aside class="flex h-full w-[280px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
      {/* Header */}
      <div class="flex items-center justify-between px-4 py-3">
        <Show
          when={workspace()}
          fallback={
            <span class="text-sm font-semibold tracking-tight text-[var(--text-primary)]">
              Mineco
            </span>
          }
        >
          <div class="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                workspaceStore.clearCurrentWorkspace();
                navigate("/");
              }}
              class="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            >
              <ArrowLeft size={10} />
              Workspaces
            </button>
            <div class="truncate text-sm font-semibold text-[var(--text-primary)]">
              {workspace()?.name}
            </div>
          </div>
        </Show>
        <Show when={workspaceId()}>
          <button
            type="button"
            onClick={handleCreate}
            class="rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
            aria-label="New session"
          >
            <Plus size={16} />
          </button>
        </Show>
      </div>

      {/* Session list */}
      <div class="flex-1 overflow-y-auto px-2">
        <For each={sessionStore.sessions()}>
          {(session: Session) => (
            <div
              role="button"
              tabIndex={0}
              class="group flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
              classList={{
                "bg-[var(--active)] text-[var(--text-primary)]":
                  currentSessionId() === session.id,
                "text-[var(--text-secondary)] hover:bg-[var(--hover)]":
                  currentSessionId() !== session.id,
              }}
              onClick={() =>
                navigate(
                  `/workspaces/${session.workspaceId}/sessions/${session.id}`,
                )
              }
            >
              <span class="flex-1 truncate">{session.title}</span>
              <button
                type="button"
                onClick={(e) => handleDelete(e, session.id)}
                class="rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--error)]"
                aria-label={`Delete ${session.title}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </For>
      </div>

      {/* Footer */}
      <div class="border-t border-[var(--border)] px-2 py-2">
        <button
          type="button"
          onClick={() => navigate("/settings")}
          class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
        >
          <Settings size={16} />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}

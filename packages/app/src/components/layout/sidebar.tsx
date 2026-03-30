import { useNavigate, useLocation } from "@solidjs/router";
import { Plus, Settings, Trash2 } from "lucide-solid";
import { For, onMount } from "solid-js";
import { api } from "../../lib/api-client";
import type { Session } from "../../lib/types";
import { sessionStore } from "../../stores/session";

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  onMount(() => {
    sessionStore.loadSessions();
  });

  const currentId = () => {
    const match = location.pathname.match(/^\/sessions\/(.+)$/);
    return match?.[1];
  };

  async function handleCreate() {
    try {
      const session = await api.createSession();
      sessionStore.addSession(session);
      navigate(`/sessions/${session.id}`);
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  }

  async function handleDelete(
    e: Event,
    id: string,
  ) {
    e.stopPropagation();
    try {
      await api.deleteSession(id);
      sessionStore.removeSession(id);
      if (currentId() === id) {
        navigate("/");
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  }

  return (
    <aside class="flex h-full w-[280px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
      {/* Header */}
      <div class="flex items-center justify-between px-4 py-3">
        <span class="text-sm font-semibold tracking-tight text-[var(--text-primary)]">
          Mineco
        </span>
        <button
          type="button"
          onClick={handleCreate}
          class="rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
          aria-label="New session"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Session list */}
      <div class="flex-1 overflow-y-auto px-2">
        <For each={sessionStore.sessions()}>
          {(session: Session) => (
            <div
              class="group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
              classList={{
                "bg-[var(--active)] text-[var(--text-primary)]":
                  currentId() === session.id,
                "text-[var(--text-secondary)] hover:bg-[var(--hover)]":
                  currentId() !== session.id,
              }}
              onClick={() => navigate(`/sessions/${session.id}`)}
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

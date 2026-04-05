import { useLocation, useNavigate } from "@solidjs/router";
import {
  ArrowLeft,
  ChartColumnBig,
  Plus,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-solid";
import { createEffect, createSignal, For, on, Show } from "solid-js";
import { useI18n } from "../../i18n/index.tsx";
import { api } from "../../lib/api-client";
import { chatStore } from "../../stores/chat";
import { sessionStore } from "../../stores/session";
import { workspaceStore } from "../../stores/workspace";

export function Sidebar() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const location = useLocation();
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [editingTitle, setEditingTitle] = createSignal("");

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

  function startEditing(e: Event, session: { id: string; title: string }) {
    e.stopPropagation();
    setEditingId(session.id);
    setEditingTitle(session.title);
  }

  async function saveTitle(id: string) {
    const title = editingTitle().trim();
    setEditingId(null);
    if (!title) return;
    try {
      await api.updateSessionTitle(id, title);
      sessionStore.updateTitle(id, title);
    } catch (err) {
      console.error("Failed to update session title:", err);
    }
  }

  function handleEditKeyDown(e: KeyboardEvent, id: string) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveTitle(id);
    } else if (e.key === "Escape") {
      setEditingId(null);
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
              {t("app.name")}
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
              {t("nav.workspaces")}
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
            aria-label={t("sidebar.newSessionAria")}
          >
            <Plus size={16} />
          </button>
        </Show>
      </div>

      {/* Session list */}
      <div class="flex-1 overflow-y-auto px-2">
        <For each={sessionStore.sessions()}>
          {(session) => (
            <div
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
              <Show when={chatStore.isStreaming(session.id)}>
                <span class="inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--primary)] animate-pulse" />
              </Show>
              <Show
                when={editingId() === session.id}
                fallback={
                  <button
                    type="button"
                    class="flex-1 truncate text-left"
                    onDblClick={(e) => startEditing(e, session)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") startEditing(e, session);
                    }}
                  >
                    {session.title}
                  </button>
                }
              >
                <input
                  class="flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-0.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  value={editingTitle()}
                  onInput={(e) => setEditingTitle(e.currentTarget.value)}
                  onKeyDown={(e) => handleEditKeyDown(e, session.id)}
                  onBlur={() => saveTitle(session.id)}
                  onClick={(e) => e.stopPropagation()}
                  ref={(el) => setTimeout(() => el.focus(), 0)}
                />
              </Show>
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
          onClick={() => navigate("/stats")}
          class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
        >
          <ChartColumnBig size={16} />
          <span>{t("nav.stats")}</span>
        </button>
        <Show when={workspaceId()}>
          <button
            type="button"
            onClick={() => navigate(`/workspaces/${workspaceId()}/skills`)}
            class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
          >
            <Sparkles size={16} />
            <span>{t("nav.skills")}</span>
          </button>
        </Show>
        <button
          type="button"
          onClick={() => navigate("/settings")}
          class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
        >
          <Settings size={16} />
          <span>{t("nav.settings")}</span>
        </button>
      </div>
    </aside>
  );
}

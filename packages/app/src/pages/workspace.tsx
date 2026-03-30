import { useParams, useNavigate } from "@solidjs/router";
import { onMount, Show, For } from "solid-js";
import { Plus, Trash2, ArrowLeft } from "lucide-solid";
import { workspaceStore } from "../stores/workspace";
import { sessionStore } from "../stores/session";
import { api } from "../lib/api-client";

export function WorkspacePage() {
  const params = useParams();
  const navigate = useNavigate();

  onMount(async () => {
    const id = params.id;
    if (!id) {
      navigate("/", { replace: true });
      return;
    }

    await workspaceStore.selectWorkspace(id);
    const ws = workspaceStore.currentWorkspace();
    if (!ws) {
      navigate("/", { replace: true });
      return;
    }

    await sessionStore.loadSessions(id);
  });

  const workspace = () => workspaceStore.currentWorkspace();
  const sessions = () => sessionStore.sessions();

  async function handleCreateSession() {
    const ws = workspace();
    if (!ws) return;
    try {
      const session = await api.createSession(ws.id);
      sessionStore.addSession(session);
      navigate(`/workspaces/${ws.id}/sessions/${session.id}`);
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  }

  async function handleDeleteSession(e: Event, id: string) {
    e.stopPropagation();
    try {
      await api.deleteSession(id);
      sessionStore.removeSession(id);
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  }

  return (
    <div class="flex h-full flex-col">
      {/* Header */}
      <div class="border-b border-[var(--border)] px-6 py-4">
        <button
          type="button"
          onClick={() => {
            workspaceStore.clearCurrentWorkspace();
            navigate("/");
          }}
          class="mb-2 flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={12} />
          All Workspaces
        </button>
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-base font-semibold text-[var(--text-primary)]">
              {workspace()?.name}
            </h1>
            <p class="mt-0.5 text-xs text-[var(--text-muted)]">
              {workspace()?.path}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreateSession}
            class="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-[var(--on-primary)] transition-colors hover:bg-[var(--primary-hover)]"
          >
            <Plus size={14} />
            New Session
          </button>
        </div>
      </div>

      {/* Sessions */}
      <div class="flex-1 overflow-y-auto px-6 py-4">
        <Show when={sessions().length === 0}>
          <div class="flex h-full items-center justify-center">
            <div class="text-center">
              <p class="text-sm text-[var(--text-muted)]">
                No sessions yet. Create one to get started.
              </p>
            </div>
          </div>
        </Show>
        <div class="space-y-1">
          <For each={sessions()}>
            {(session) => (
              <div
                class="group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--hover)]"
                onClick={() =>
                  navigate(`/workspaces/${session.workspaceId}/sessions/${session.id}`)
                }
              >
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm text-[var(--text-primary)]">
                    {session.title}
                  </div>
                  <div class="text-xs text-[var(--text-muted)]">
                    {new Date(session.updatedAt).toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => handleDeleteSession(e, session.id)}
                  class="rounded p-1 text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--error)]"
                  aria-label={`Delete ${session.title}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

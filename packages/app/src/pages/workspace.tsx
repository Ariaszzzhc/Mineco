import { useNavigate, useParams } from "@solidjs/router";
import { ArrowLeft, GitBranch, Plus, Trash2 } from "lucide-solid";
import { createEffect, createSignal, For, on, Show } from "solid-js";
import { ConfirmDialog } from "../components/ui/confirm-dialog.tsx";
import { Dropdown } from "../components/ui/dropdown.tsx";
import { NewSessionDialog } from "../components/workspace/new-session-dialog.tsx";
import { useI18n } from "../i18n/index.tsx";
import { api } from "../lib/api-client";
import { sessionStore } from "../stores/session";
import { workspaceStore } from "../stores/workspace";

interface GitInfo {
  isGitRepo: boolean;
  gitRoot: string | null;
  currentBranch: string | null;
}

export function WorkspacePage() {
  const params = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [gitInfo, setGitInfo] = createSignal<GitInfo | null>(null);
  const [showWorktreeDialog, setShowWorktreeDialog] = createSignal(false);
  const [confirmDelete, setConfirmDelete] = createSignal<string | null>(null);
  const [deleteError, setDeleteError] = createSignal<string | null>(null);

  createEffect(
    on(
      () => params.id,
      async (id) => {
        if (!id) {
          navigate("/", { replace: true });
          return;
        }

        // Load workspace and sessions in parallel
        await Promise.all([
          workspaceStore.selectWorkspace(id),
          sessionStore.loadSessions(id),
        ]);

        if (!workspaceStore.currentWorkspace()) {
          navigate("/", { replace: true });
          return;
        }

        // Check git info
        try {
          const info = await api.getWorkspaceGitInfo(id);
          setGitInfo(info);
        } catch {
          setGitInfo({ isGitRepo: false, gitRoot: null, currentBranch: null });
        }
      },
    ),
  );

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

  async function handleCreateWorktreeSession(branchName: string) {
    const ws = workspace();
    if (!ws) return;
    try {
      const session = await api.createSession(ws.id, {
        mode: "worktree",
        branchName,
      });
      sessionStore.addSession(session);
      setShowWorktreeDialog(false);
      navigate(`/workspaces/${ws.id}/sessions/${session.id}`);
    } catch (err) {
      console.error("Failed to create worktree session:", err);
    }
  }

  async function handleDeleteSession(id: string) {
    setDeleteError(null);
    try {
      const result = await api.deleteSession(id);
      if (result.hasUncommittedChanges) {
        setConfirmDelete(id);
        return;
      }
      sessionStore.removeSession(id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t("common.error"));
    }
  }

  async function handleForceDeleteSession(id: string) {
    setDeleteError(null);
    try {
      await api.deleteSession(id, true);
      sessionStore.removeSession(id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t("common.error"));
    }
    setConfirmDelete(null);
  }

  function generateDefaultBranchName(): string {
    const shortId = crypto.randomUUID().slice(0, 8);
    return `mineco/session-${shortId}`;
  }

  const isGitRepo = () => gitInfo()?.isGitRepo ?? false;

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
          {t("workspace.allWorkspaces")}
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

          {/* New Session button — dropdown for git repos */}
          <Show
            when={isGitRepo()}
            fallback={
              <button
                type="button"
                onClick={handleCreateSession}
                class="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-[var(--on-primary)] transition-colors hover:bg-[var(--primary-hover)]"
              >
                <Plus size={14} />
                {t("workspace.newSession")}
              </button>
            }
          >
            <Dropdown
              align="right"
              trigger={
                <button
                  type="button"
                  class="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-[var(--on-primary)] transition-colors hover:bg-[var(--primary-hover)]"
                >
                  <Plus size={14} />
                  {t("workspace.newSession")}
                </button>
              }
              items={[
                {
                  label: t("workspace.newSession.regular"),
                  icon: <Plus size={14} />,
                  onClick: handleCreateSession,
                },
                {
                  label: t("workspace.newSession.worktree"),
                  icon: <GitBranch size={14} />,
                  onClick: () => setShowWorktreeDialog(true),
                },
              ]}
            />
          </Show>
        </div>
      </div>

      {/* Sessions */}
      <div class="flex-1 overflow-y-auto px-6 py-4">
        <Show when={deleteError()}>
          <div class="mb-3 flex items-center justify-between rounded-lg bg-red-500/10 px-3 py-2 text-xs text-[var(--error)]">
            <span>{deleteError()}</span>
            <button
              type="button"
              class="ml-2 font-medium hover:underline"
              onClick={() => setDeleteError(null)}
            >
              {t("common.dismiss")}
            </button>
          </div>
        </Show>
        <Show when={sessions().length === 0}>
          <div class="flex h-full items-center justify-center">
            <div class="text-center">
              <p class="text-sm text-[var(--text-muted)]">
                {t("workspace.session.empty")}
              </p>
            </div>
          </div>
        </Show>
        <div class="space-y-1">
          <For each={sessions()}>
            {(session) => (
              <div class="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--hover)]">
                <a
                  href={`/workspaces/${session.workspaceId}/sessions/${session.id}`}
                  class="min-w-0 flex-1"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(
                      `/workspaces/${session.workspaceId}/sessions/${session.id}`,
                    );
                  }}
                >
                  <div class="flex items-center gap-2">
                    <span class="truncate text-sm text-[var(--text-primary)]">
                      {session.title}
                    </span>
                    <Show when={session.worktreeBranch}>
                      <span class="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-[var(--primary-subtle)] text-[var(--primary)]">
                        <GitBranch size={10} />
                        {session.worktreeBranch}
                      </span>
                    </Show>
                  </div>
                  <div class="text-xs text-[var(--text-muted)]">
                    {new Date(session.updatedAt).toLocaleString()}
                  </div>
                </a>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSession(session.id);
                  }}
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

      {/* Worktree creation dialog */}
      <Show when={showWorktreeDialog()}>
        <NewSessionDialog
          defaultBranchName={generateDefaultBranchName()}
          onCreate={handleCreateWorktreeSession}
          onCancel={() => setShowWorktreeDialog(false)}
        />
      </Show>

      {/* Delete confirmation dialog */}
      <Show when={confirmDelete()}>
        <ConfirmDialog
          title={t("workspace.worktree.uncommittedTitle")}
          message={t("workspace.worktree.uncommittedMessage")}
          variant="danger"
          onConfirm={() => {
            const id = confirmDelete();
            if (id) handleForceDeleteSession(id);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      </Show>
    </div>
  );
}

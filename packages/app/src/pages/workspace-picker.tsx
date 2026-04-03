import { useNavigate } from "@solidjs/router";
import { createSignal, For, onMount, Show } from "solid-js";
import { useI18n } from "../i18n/index.tsx";
import { DirBrowser } from "../components/workspace/dir-browser";
import { usePlatform } from "../lib/platform";
import { workspaceStore } from "../stores/workspace";

export function WorkspacePickerPage() {
  const navigate = useNavigate();
  const platform = usePlatform();
  const [showBrowser, setShowBrowser] = createSignal(false);
  const { t, locale } = useI18n();

  onMount(() => {
    workspaceStore.loadWorkspaces();
  });

  async function handleOpenWorkspace(id: string) {
    await workspaceStore.selectWorkspace(id);
    const ws = workspaceStore.currentWorkspace();
    if (ws) {
      navigate(`/workspaces/${ws.id}`);
    }
  }

  async function handleOpenDirectory() {
    if (platform.capabilities.directoryPicker) {
      try {
        const path = await platform.directoryPicker.pickDirectory();
        if (path) {
          const ws = await workspaceStore.createWorkspace(path);
          navigate(`/workspaces/${ws.id}`);
        }
      } catch {
        // Native dialog failed — fall back to JS browser
        setShowBrowser(true);
      }
      return;
    }
    // Fallback: show JS directory browser
    setShowBrowser(true);
  }

  async function handleSelectDirectory(path: string) {
    setShowBrowser(false);
    const ws = await workspaceStore.createWorkspace(path);
    navigate(`/workspaces/${ws.id}`);
  }

  function formatTime(ts: number) {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" });
    if (diffMin < 1) return rtf.format(0, "second");
    if (diffMin < 60) return rtf.format(-diffMin, "minute");
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return rtf.format(-diffHr, "hour");
    return new Intl.DateTimeFormat(locale()).format(d);
  }

  return (
    <div class="flex h-full items-center justify-center">
      <div class="w-full max-w-lg px-6">
        <div class="text-center">
          <h1 class="text-xl font-semibold text-[var(--text-primary)]">
            {t("workspace.title")}
          </h1>
          <p class="mt-1 text-sm text-[var(--text-secondary)]">
            {t("workspace.subtitle")}
          </p>
        </div>

        {/* Open directory button */}
        <div class="mt-6">
          <button
            type="button"
            onClick={handleOpenDirectory}
            class="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--border)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-subtle)] hover:text-[var(--primary)]"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M8 3v10M3 8h10"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
            {t("workspace.openDirectory")}
          </button>
        </div>

        {/* Recent workspaces */}
        <Show when={workspaceStore.workspaces().length > 0}>
          <div class="mt-6">
            <h2 class="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
              {t("workspace.recent")}
            </h2>
            <div class="space-y-1">
              <For each={workspaceStore.workspaces()}>
                {(ws) => (
                  <button
                    type="button"
                    onClick={() => handleOpenWorkspace(ws.id)}
                    class="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--hover)]"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      class="shrink-0 text-[var(--text-muted)]"
                      aria-hidden="true"
                    >
                      <path
                        d="M2 4.5A1.5 1.5 0 013.5 3h3.172a1.5 1.5 0 011.06.44l.94.94H12.5A1.5 1.5 0 0114 5.88v5.62a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5V4.5z"
                        fill="currentColor"
                      />
                    </svg>
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-sm font-medium text-[var(--text-primary)]">
                        {ws.name}
                      </div>
                      <div class="truncate text-xs text-[var(--text-muted)]">
                        {ws.path}
                      </div>
                    </div>
                    <span class="shrink-0 text-xs text-[var(--text-muted)]">
                      {formatTime(ws.lastOpenedAt)}
                    </span>
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>

        {/* Empty state */}
        <Show
          when={
            workspaceStore.workspaces().length === 0 &&
            !workspaceStore.loading()
          }
        >
          <div class="mt-8 text-center">
            <p class="text-sm text-[var(--text-muted)]">
              {t("workspace.empty")}
            </p>
          </div>
        </Show>
      </div>

      {/* Directory browser modal */}
      <Show when={showBrowser()}>
        <DirBrowser
          onSelect={handleSelectDirectory}
          onClose={() => setShowBrowser(false)}
        />
      </Show>
    </div>
  );
}

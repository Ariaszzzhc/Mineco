import { createSignal, For, onMount, Show } from "solid-js";
import { api } from "../../lib/api-client";
import { Button } from "../ui/button";

interface DirEntry {
  name: string;
  path: string;
}

interface DirBrowserProps {
  onSelect: (path: string) => void;
  onClose: () => void;
}

export function DirBrowser(props: DirBrowserProps) {
  const [currentPath, setCurrentPath] = createSignal("");
  const [parentPath, setParentPath] = createSignal<string | null>(null);
  const [directories, setDirectories] = createSignal<DirEntry[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function browse(path?: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await api.browseFs(path);
      setCurrentPath(result.currentPath);
      setParentPath(result.parentPath);
      setDirectories(result.directories);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to browse");
    } finally {
      setLoading(false);
    }
  }

  onMount(() => browse());

  function navigateTo(path: string) {
    browse(path);
  }

  function goUp() {
    const parent = parentPath();
    if (parent !== null) {
      browse(parent);
    }
  }

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div class="flex h-[480px] w-[520px] flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl">
        {/* Header */}
        <div class="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 class="text-sm font-semibold text-[var(--text-primary)]">
            Select Directory
          </h2>
          <button
            type="button"
            onClick={props.onClose}
            class="rounded-md p-1 text-[var(--text-secondary)] hover:bg-[var(--hover)]"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Current path breadcrumb */}
        <div class="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2">
          <Show when={parentPath() !== null}>
            <button
              type="button"
              onClick={goUp}
              class="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--hover)]"
              aria-label="Go up"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M10 12L6 8l4-4"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </Show>
          <span class="truncate text-xs text-[var(--text-secondary)]">
            {currentPath()}
          </span>
        </div>

        {/* Directory list */}
        <div class="flex-1 overflow-y-auto px-2 py-1">
          <Show when={error()}>
            <div class="px-3 py-2 text-xs text-[var(--error)]">{error()}</div>
          </Show>
          <Show when={loading()}>
            <div class="px-3 py-2 text-xs text-[var(--text-muted)]">
              Loading...
            </div>
          </Show>
          <Show when={!loading() && directories().length === 0}>
            <div class="px-3 py-2 text-xs text-[var(--text-muted)]">
              No directories found
            </div>
          </Show>
          <For each={directories()}>
            {(dir) => (
              <button
                type="button"
                onClick={() => navigateTo(dir.path)}
                class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2 4.5A1.5 1.5 0 013.5 3h3.172a1.5 1.5 0 011.06.44l.94.94H12.5A1.5 1.5 0 0114 5.88v5.62a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5V4.5z"
                    fill="currentColor"
                    opacity="0.4"
                  />
                </svg>
                <span class="truncate">{dir.name}</span>
              </button>
            )}
          </For>
        </div>

        {/* Footer */}
        <div class="flex items-center justify-between border-t border-[var(--border)] px-4 py-3">
          <span class="truncate text-xs text-[var(--text-muted)]">
            {currentPath()}
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={() => props.onSelect(currentPath())}
            disabled={!currentPath()}
          >
            Select This Directory
          </Button>
        </div>
      </div>
    </div>
  );
}

import { AlertTriangle, Play, ShieldAlert, Terminal, FileEdit, FileSearch } from "lucide-solid";
import { Show, For } from "solid-js";
import { chatStore } from "../../stores/chat.ts";

interface PermissionDialogProps {
  sessionId: string;
}

export function PermissionDialog(props: PermissionDialogProps) {
  const pending = () => chatStore.pendingPermissions(props.sessionId) ?? [];

  return (
    <Show when={pending().length > 0}>
      <div class="space-y-2">
        <For each={pending()}>
          {(perm) => {
            const isExecute = perm.riskLevel === "execute";
            const isWrite = perm.riskLevel === "write";

            return (
              <div class="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                <div class="mb-2 flex items-center gap-2">
                  <Show when={isExecute} fallback={<Show when={isWrite} fallback={<FileSearch size={16} class="text-[var(--info)]" />}><FileEdit size={16} class="text-[var(--warning)]" /></Show>}>
                    <Terminal size={16} class="text-[var(--error)]" />
                  </Show>
                  <span class="text-sm font-medium text-[var(--text)]">
                    {perm.toolName}
                  </span>
                  <span
                    class={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${isExecute ? "text-[var(--error)]" : isWrite ? "text-[var(--warning)]" : "text-[var(--info)]"} bg-[var(--code-background)]`}
                  >
                    {perm.riskLevel}
                  </span>
                </div>

                <p class="mb-2 text-xs text-[var(--text-secondary)]">
                  {perm.reason}
                </p>

                <Show when={perm.toolName === "bash" && perm.args?.command}>
                  {(command) => (
                    <pre class="mb-2 max-h-[120px] overflow-auto rounded bg-[var(--code-background)] p-2 text-xs text-[var(--text-secondary)]">
                      {typeof command() === "string" ? command() : JSON.stringify(command(), null, 2)}
                    </pre>
                  )}
                </Show>

                <Show
                  when={
                    perm.toolName !== "bash" &&
                    perm.args?.file_path
                  }
                >
                  {(fp) => (
                    <p class="mb-2 font-mono text-xs text-[var(--text-muted)]">
                      {typeof fp() === "string" ? fp() : JSON.stringify(fp())}
                    </p>
                  )}
                </Show>

                <div class="flex gap-2">
                  <button
                    type="button"
                    class="flex-1 rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90"
                    onClick={() =>
                      chatStore.respondPermission(
                        props.sessionId,
                        perm.requestId,
                        "allow",
                      )
                    }
                  >
                    Allow
                  </button>
                  <button
                    type="button"
                    class="flex-1 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--hover)]"
                    onClick={() =>
                      chatStore.respondPermission(
                        props.sessionId,
                        perm.requestId,
                        "deny",
                      )
                    }
                  >
                    Deny
                  </button>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </Show>
  );
}

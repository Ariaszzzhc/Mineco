import { For, Show } from "solid-js";
import { Trash2 } from "lucide-solid";
import type { ProviderConfig } from "../../lib/types";
import { configStore } from "../../stores/config";
import { Button } from "../ui/button";

export function ProviderList() {
  const providers = () => configStore.config()?.providers ?? [];

  async function handleDelete(id: string) {
    await configStore.deleteProvider(id);
  }

  function providerInfo(p: ProviderConfig): { name: string; detail: string } {
    if (p.type === "zhipu") {
      return {
        name: "Zhipu",
        detail: `${p.platform} / ${p.endpoint}`,
      };
    }
    return {
      name: p.id,
      detail: p.baseURL,
    };
  }

  function maskKey(key: string): string {
    if (key.length <= 8) return "****";
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  function getApiKey(p: ProviderConfig): string | undefined {
    return p.apiKey;
  }

  return (
    <div>
      <Show when={providers().length === 0}>
        <div class="rounded-lg border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
          No providers configured. Add one below.
        </div>
      </Show>
      <div class="space-y-2">
        <For each={providers()}>
          {(p) => {
            const info = providerInfo(p);
            return (
              <div class="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-[var(--text-primary)]">
                      {info.name}
                    </span>
                    <span class="rounded-full bg-[var(--surface-elevated)] px-2 py-0.5 text-[10px] font-medium uppercase text-[var(--text-muted)]">
                      {p.type}
                    </span>
                  </div>
                  <div class="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                    {info.detail}
                  </div>
                  <Show when={getApiKey(p)}>
                    <div class="mt-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                      Key: {maskKey(getApiKey(p)!)}
                    </div>
                  </Show>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    handleDelete(
                      p.type === "zhipu" ? "zhipu" : p.id,
                    )
                  }
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}

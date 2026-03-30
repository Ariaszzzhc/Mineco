import { useNavigate } from "@solidjs/router";
import { Show } from "solid-js";
import { configStore } from "../../stores/config";

export function StatusBar() {
  const navigate = useNavigate();

  const providerName = () => {
    const config = configStore.config();
    if (!config || config.providers.length === 0) return null;
    const defaultId = config.settings.defaultProvider;
    const provider = config.providers.find((p) =>
      p.type === "zhipu" ? defaultId === "zhipu" : p.id === defaultId,
    );
    if (provider) {
      return provider.type === "zhipu"
        ? "Zhipu"
        : (provider as { type: "openai-compatible"; id: string }).id;
    }
    return config.providers[0]?.type === "zhipu"
      ? "Zhipu"
      : (config.providers[0] as { type: "openai-compatible"; id: string })?.id;
  };

  const modelName = () => configStore.config()?.settings.defaultModel ?? "";

  return (
    <div class="flex h-7 items-center justify-between border-t border-[var(--border)] bg-[var(--surface)] px-3 text-[11px] text-[var(--text-muted)]">
      <div class="flex items-center gap-2">
        <Show
          when={providerName()}
          fallback={
            <button
              type="button"
              onClick={() => navigate("/settings")}
              class="text-[var(--warning)] hover:underline"
            >
              No provider configured
            </button>
          }
        >
          <span>{providerName()}</span>
          <Show when={modelName()}>
            <span class="text-[var(--text-muted)]">/ {modelName()}</span>
          </Show>
        </Show>
      </div>
      <div class="flex items-center gap-1.5" />
    </div>
  );
}

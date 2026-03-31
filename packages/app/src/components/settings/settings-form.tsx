import { createEffect, createSignal, For, Show } from "solid-js";
import type { ProviderConfig } from "../../lib/types";
import { configStore } from "../../stores/config";
import { Button } from "../ui/button";

export function SettingsForm() {
  const [providerId, setProviderId] = createSignal("");
  const [model, setModel] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const config = () => configStore.config();
  const providers = () => config()?.providers ?? [];

  function providerLabel(p: ProviderConfig): string {
    return p.type === "zhipu" ? "Zhipu" : p.id;
  }

  function availableModels(): Array<{ id: string; name: string }> {
    const pid = providerId();
    if (!pid) return [];
    const meta = configStore.providerModels().find((p) => p.id === pid);
    return meta?.models ?? [];
  }

  async function handleSave() {
    setSaving(true);
    try {
      const settings: Record<string, string> = {};
      if (providerId()) settings.defaultProvider = providerId()!;
      if (model()) settings.defaultModel = model()!;
      await configStore.updateSettings(
        settings as Partial<import("../../lib/types").AppSettings>,
      );
    } finally {
      setSaving(false);
    }
  }

  // Sync from config reactively
  createEffect(() => {
    const cfg = config();
    if (cfg?.settings.defaultProvider) {
      setProviderId(cfg.settings.defaultProvider);
    }
    if (cfg?.settings.defaultModel) {
      setModel(cfg.settings.defaultModel);
    }
  });

  return (
    <div class="space-y-4">
      <label class="block">
        <span class="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
          Default Provider
        </span>
        <select
          value={providerId()}
          onChange={(e) => {
            setProviderId(e.currentTarget.value);
            setModel("");
          }}
          class="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-focus)] focus:outline-none"
        >
          <option value="">Select provider</option>
          <For each={providers()}>
            {(p) => (
              <option value={p.type === "zhipu" ? "zhipu" : p.id}>
                {providerLabel(p)}
              </option>
            )}
          </For>
        </select>
      </label>

      <Show when={availableModels().length > 0}>
        <label class="block">
          <span class="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
            Default Model
          </span>
          <select
            value={model()}
            onChange={(e) => setModel(e.currentTarget.value)}
            class="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-focus)] focus:outline-none"
          >
            <option value="">Select model</option>
            <For each={availableModels()}>
              {(m) => <option value={m.id}>{m.name}</option>}
            </For>
          </select>
        </label>
      </Show>

      <Button variant="primary" onClick={handleSave} disabled={saving()}>
        {saving() ? "Saving..." : "Save Defaults"}
      </Button>
    </div>
  );
}

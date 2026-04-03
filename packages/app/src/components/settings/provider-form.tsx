import { createSignal, Show } from "solid-js";
import { useI18n } from "../../i18n/index.tsx";
import { configStore } from "../../stores/config";
import { Button } from "../ui/button";

export function ProviderForm() {
  const { t } = useI18n();
  const [type, setType] = createSignal<"zhipu" | "openai-compatible">("zhipu");
  const [apiKey, setApiKey] = createSignal("");
  const [platform, setPlatform] = createSignal<"cn" | "intl">("cn");
  const [endpoint, setEndpoint] = createSignal<"general" | "coding">("general");
  const [compId, setCompId] = createSignal("");
  const [baseURL, setBaseURL] = createSignal("");
  const [modelId, setModelId] = createSignal("");
  const [modelName, setModelName] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (type() === "zhipu") {
        await configStore.addProvider({
          type: "zhipu",
          apiKey: apiKey(),
          platform: platform(),
          endpoint: endpoint(),
        });
      } else {
        await configStore.addProvider({
          type: "openai-compatible",
          id: compId(),
          baseURL: baseURL(),
          ...(apiKey() ? { apiKey: apiKey() } : {}),
          models: [{ id: modelId(), name: modelName() }],
        });
      }
      // Reset form
      setApiKey("");
      setCompId("");
      setBaseURL("");
      setModelId("");
      setModelName("");
    } catch (err) {
      console.error("Failed to add provider:", err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} class="space-y-4">
      <div class="flex gap-2">
        <button
          type="button"
          onClick={() => setType("zhipu")}
          class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          classList={{
            "bg-[var(--primary)] text-[var(--on-primary)]": type() === "zhipu",
            "bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:bg-[var(--active)]":
              type() !== "zhipu",
          }}
        >
          {t("provider.zhipu")}
        </button>
        <button
          type="button"
          onClick={() => setType("openai-compatible")}
          class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          classList={{
            "bg-[var(--primary)] text-[var(--on-primary)]":
              type() === "openai-compatible",
            "bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:bg-[var(--active)]":
              type() !== "openai-compatible",
          }}
        >
          {t("provider.openaiCompatible")}
        </button>
      </div>

      <Show when={type() === "zhipu"}>
        <div class="space-y-3">
          <label class="block">
            <span class="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              {t("provider.apiKey")}
            </span>
            <input
              type="password"
              value={apiKey()}
              onInput={(e) => setApiKey(e.currentTarget.value)}
              required
              class="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-focus)] focus:outline-none"
              placeholder={t("provider.enterApiKey")}
            />
          </label>
          <div class="flex gap-3">
            <label class="flex-1">
              <span class="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                {t("provider.platform")}
              </span>
              <select
                value={platform()}
                onChange={(e) =>
                  setPlatform(e.currentTarget.value as "cn" | "intl")
                }
                class="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-focus)] focus:outline-none"
              >
                <option value="cn">{t("provider.platform.cn")}</option>
                <option value="intl">{t("provider.platform.intl")}</option>
              </select>
            </label>
            <label class="flex-1">
              <span class="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                {t("provider.endpoint")}
              </span>
              <select
                value={endpoint()}
                onChange={(e) =>
                  setEndpoint(e.currentTarget.value as "general" | "coding")
                }
                class="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-focus)] focus:outline-none"
              >
                <option value="general">{t("provider.endpoint.general")}</option>
                <option value="coding">{t("provider.endpoint.coding")}</option>
              </select>
            </label>
          </div>
        </div>
      </Show>

      <Show when={type() === "openai-compatible"}>
        <div class="space-y-3">
          <label class="block">
            <span class="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              {t("provider.providerId")}
            </span>
            <input
              type="text"
              value={compId()}
              onInput={(e) => setCompId(e.currentTarget.value)}
              required
              class="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-focus)] focus:outline-none"
              placeholder={t("provider.providerIdPlaceholder")}
            />
          </label>
          <label class="block">
            <span class="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              {t("provider.baseURL")}
            </span>
            <input
              type="url"
              value={baseURL()}
              onInput={(e) => setBaseURL(e.currentTarget.value)}
              required
              class="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-focus)] focus:outline-none"
              placeholder={t("provider.baseURLPlaceholder")}
            />
          </label>
          <label class="block">
            <span class="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              {t("provider.apiKeyOptional")}
            </span>
            <input
              type="password"
              value={apiKey()}
              onInput={(e) => setApiKey(e.currentTarget.value)}
              class="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-focus)] focus:outline-none"
              placeholder={t("provider.enterApiKey")}
            />
          </label>
          <div class="rounded-lg border border-[var(--border)] p-3">
            <div class="mb-2 text-xs font-medium text-[var(--text-secondary)]">
              {t("provider.defaultModel")}
            </div>
            <div class="flex gap-2">
              <input
                type="text"
                value={modelId()}
                onInput={(e) => setModelId(e.currentTarget.value)}
                required
                placeholder={t("provider.modelId")}
                class="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-focus)] focus:outline-none"
              />
              <input
                type="text"
                value={modelName()}
                onInput={(e) => setModelName(e.currentTarget.value)}
                required
                placeholder={t("provider.modelName")}
                class="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-focus)] focus:outline-none"
              />
            </div>
          </div>
        </div>
      </Show>

      <Button type="submit" variant="primary" disabled={submitting()}>
        {submitting() ? t("provider.adding") : t("settings.addProvider")}
      </Button>
    </form>
  );
}

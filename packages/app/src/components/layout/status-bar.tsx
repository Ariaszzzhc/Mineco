import { useNavigate } from "@solidjs/router";
import { Cpu } from "lucide-solid";
import { createMemo, onCleanup, onMount, Show } from "solid-js";
import { useI18n } from "../../i18n/index.tsx";
import { chatStore } from "../../stores/chat";
import { configStore } from "../../stores/config";
import { subscriptionStore } from "../../stores/subscription";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function StatusBar() {
  const navigate = useNavigate();
  const { t } = useI18n();

  onMount(() => {
    subscriptionStore.startAutoRefresh();
  });
  onCleanup(() => {
    subscriptionStore.stopAutoRefresh();
  });

  const providerName = () => {
    const config = configStore.config();
    if (!config || config.providers.length === 0) return null;
    const defaultId = config.settings.defaultProvider;
    const provider = config.providers.find((p) =>
      p.type === "zhipu" || p.type === "minimax"
        ? defaultId === p.type
        : p.id === defaultId,
    );
    if (provider) {
      return provider.type === "zhipu"
        ? "Zhipu"
        : provider.type === "minimax"
          ? "Minimax"
          : (provider as { type: "openai-compatible"; id: string }).id;
    }
    return config.providers[0]?.type === "zhipu"
      ? "Zhipu"
      : config.providers[0]?.type === "minimax"
        ? "Minimax"
        : (config.providers[0] as { type: "openai-compatible"; id: string })?.id;
  };

  const modelName = () => configStore.config()?.settings.defaultModel ?? "";

  const contextWindow = createMemo(() => {
    const providerId = configStore.activeProviderId();
    const modelId = configStore.activeModel();
    if (!providerId || !modelId) return null;

    const providerMeta = configStore
      .providerModels()
      .find((p) => p.id === providerId);
    if (!providerMeta) return null;

    const model = providerMeta.models.find((m) => m.id === modelId);
    return model?.contextWindow ?? null;
  });

  const activeSessionId = () => chatStore.activeSessionId();

  const usagePercent = createMemo(() => {
    const cw = contextWindow();
    const sid = activeSessionId();
    const usage = sid ? chatStore.sessionUsage(sid) : { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    if (!cw || cw === 0) return 0;
    return Math.min((usage.totalTokens / cw) * 100, 100);
  });

  const progressColor = createMemo(() => {
    const pct = usagePercent();
    if (pct >= 90) return "var(--error)";
    if (pct >= 70) return "var(--warning)";
    return "var(--success)";
  });

  const primaryQuota = createMemo(() => {
    const info = subscriptionStore.info();
    if (!info) return null;
    return { percentage: info.primaryPercentage };
  });

  return (
    <div class="flex h-7 items-center justify-between border-t border-[var(--border)] bg-[var(--surface)] px-3 text-[11px] text-[var(--text-muted)]">
      {/* Left: Provider / Model */}
      <div class="flex items-center gap-2 min-w-0 shrink-0">
        <Show
          when={providerName()}
          fallback={
            <button
              type="button"
              onClick={() => navigate("/settings")}
              class="text-[var(--warning)] hover:underline"
            >
              {t("status.noProvider")}
            </button>
          }
        >
          <span class="truncate">{providerName()}</span>
          <Show when={modelName()}>
            <span class="text-[var(--text-muted)]">/ {modelName()}</span>
          </Show>
        </Show>
      </div>

      {/* Center: Context window progress */}
      <Show when={contextWindow()}>
        {(cw) => (
          <div class="flex items-center gap-2 min-w-0 shrink">
            <Cpu size={12} class="shrink-0 text-[var(--text-muted)]" />
            <div class="flex items-center gap-1.5">
              <span class="whitespace-nowrap tabular-nums">
                {formatTokens(activeSessionId() ? chatStore.sessionUsage(activeSessionId()!).totalTokens : 0)}
              </span>
              <span class="text-[var(--text-muted)]">/</span>
              <span class="whitespace-nowrap tabular-nums">
                {formatTokens(cw())}
              </span>
            </div>
            <div class="h-1.5 w-20 rounded-full bg-[var(--surface-elevated)]">
              <div
                class="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${usagePercent()}%`,
                  "background-color": progressColor(),
                }}
              />
            </div>
          </div>
        )}
      </Show>

      {/* Right: Subscription / Token info */}
      <div class="flex items-center gap-2 min-w-0 shrink-0">
        <Show
          when={subscriptionStore.info()}
          fallback={
            <Show when={activeSessionId() && chatStore.sessionUsage(activeSessionId()!).totalTokens > 0}>
              <span class="tabular-nums">
                {formatTokens(chatStore.sessionUsage(activeSessionId()!).promptTokens)} in +{" "}
                {formatTokens(chatStore.sessionUsage(activeSessionId()!).completionTokens)} out
              </span>
            </Show>
          }
        >
          {(info) => (
            <>
              <span class="font-medium text-[var(--text-secondary)]">
                {info().planName}
              </span>
              <Show when={primaryQuota()}>
                {(q) => (
                  <span class="tabular-nums">{q().percentage.toFixed(0)}%</span>
                )}
              </Show>
            </>
          )}
        </Show>
      </div>
    </div>
  );
}

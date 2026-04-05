import { useNavigate } from "@solidjs/router";
import { ArrowLeft } from "lucide-solid";
import { onMount } from "solid-js";
import { ProviderForm } from "../components/settings/provider-form";
import { ProviderList } from "../components/settings/provider-list";
import { SettingsForm } from "../components/settings/settings-form";
import type { Locale } from "../i18n/index.tsx";
import { useI18n } from "../i18n/index.tsx";
import { configStore } from "../stores/config";

export function SettingsPage() {
  const navigate = useNavigate();
  const { t, locale, setLocale } = useI18n();

  onMount(() => {
    if (!configStore.config()) {
      configStore.loadConfig();
    }
  });

  return (
    <div class="flex h-full flex-col animate-fade-in">
      {/* Header */}
      <div class="flex items-center gap-3 border-b border-[var(--border)] px-6 py-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          class="rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
          aria-label={t("nav.goBack")}
        >
          <ArrowLeft size={18} />
        </button>
        <h1 class="text-sm font-semibold text-[var(--text-primary)]">
          {t("settings.title")}
        </h1>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-y-auto">
        <div class="mx-auto max-w-2xl space-y-8 px-6 py-8">
          {/* Language section */}
          <section>
            <h2 class="mb-4 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
              {t("settings.language")}
            </h2>
            <div class="rounded-lg border border-[var(--border)] p-4">
              <select
                value={locale()}
                onChange={(e) => setLocale(e.currentTarget.value as Locale)}
                class="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-focus)] focus:outline-none"
              >
                <option value="en">{t("language.en")}</option>
                <option value="zh-CN">{t("language.zhCN")}</option>
              </select>
            </div>
          </section>

          {/* Providers section */}
          <section>
            <h2 class="mb-4 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
              {t("settings.providers")}
            </h2>
            <div class="space-y-4">
              <ProviderList />
              <div class="rounded-lg border border-[var(--border)] p-4">
                <h3 class="mb-3 text-sm font-medium text-[var(--text-primary)]">
                  {t("settings.addProvider")}
                </h3>
                <ProviderForm />
              </div>
            </div>
          </section>

          {/* Defaults section */}
          <section>
            <h2 class="mb-4 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
              {t("settings.defaults")}
            </h2>
            <div class="rounded-lg border border-[var(--border)] p-4">
              <SettingsForm />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

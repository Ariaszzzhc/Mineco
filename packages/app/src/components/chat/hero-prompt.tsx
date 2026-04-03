import { useI18n } from "../../i18n/index.tsx";

export function HeroPrompt() {
  const { t } = useI18n();
  return (
    <div class="flex flex-1 items-center justify-center">
      <div class="text-center">
        <h1 class="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          {t("chat.heroTitle")}
        </h1>
        <p class="mt-2 text-sm text-[var(--text-secondary)]">
          {t("chat.heroSubtitle")}
        </p>
      </div>
    </div>
  );
}

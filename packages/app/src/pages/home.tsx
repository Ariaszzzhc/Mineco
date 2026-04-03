import { useNavigate } from "@solidjs/router";
import { onMount } from "solid-js";
import { useI18n } from "../i18n/index.tsx";

export function HomePage() {
  const navigate = useNavigate();
  const { t } = useI18n();

  onMount(() => {
    // Sessions require a workspace — redirect to workspace list
    navigate("/workspaces", { replace: true });
  });

  return (
    <div class="flex h-full items-center justify-center">
      <div class="text-sm text-[var(--text-muted)]">
        {t("common.redirecting")}
      </div>
    </div>
  );
}

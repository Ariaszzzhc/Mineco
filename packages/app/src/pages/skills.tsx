import { useNavigate, useParams } from "@solidjs/router";
import { ArrowLeft } from "lucide-solid";
import { createEffect, createMemo, on, Show } from "solid-js";
import { useI18n } from "../i18n/index.tsx";
import { skillStore } from "../stores/skill-store";
import { workspaceStore } from "../stores/workspace";
import { SkillGroupSection } from "../components/skills/skill-group-section";

export function SkillsPage() {
  const params = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();

  const workspaceId = () => params.id;

  const projectSkills = createMemo(() =>
    skillStore.skills().filter((s) => s.source === "project"),
  );

  const userSkills = createMemo(() =>
    skillStore.skills().filter((s) => s.source === "user"),
  );

  // Load skills when workspace is available
  createEffect(
    on(workspaceId, async (id) => {
      if (!id) return;
      const ws = workspaceStore.currentWorkspace();
      if (ws?.path) {
        await skillStore.loadSkills(ws.path);
      }
    }),
  );

  return (
    <div class="flex h-full flex-col animate-fade-in">
      {/* Header */}
      <div class="flex items-center gap-3 border-b border-[var(--border)] px-6 py-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          class="rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 class="text-sm font-semibold text-[var(--text-primary)]">
          {t("skills.title")}
        </h1>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-y-auto">
        <div class="mx-auto max-w-4xl px-6 py-6">
          {/* Loading state */}
          <Show
            when={skillStore.loading()}
            fallback={
              <>
                {/* Empty state */}
                <Show
                  when={skillStore.skills().length === 0}
                  fallback={
                    <>
                      <SkillGroupSection
                        title={t("skills.projectSkills")}
                        skills={projectSkills()}
                      />
                      <SkillGroupSection
                        title={t("skills.userSkills")}
                        skills={userSkills()}
                      />
                    </>
                  }
                >
                  <div class="flex flex-col items-center justify-center py-16">
                    <p class="text-sm text-[var(--text-muted)]">
                      {t("skills.noSkills")}
                    </p>
                  </div>
                </Show>

                {/* Error state */}
                <Show when={skillStore.error()}>
                  {(err) => (
                    <div class="rounded-lg border border-[var(--error)] bg-red-50 px-4 py-3 text-xs text-[var(--error)]">
                      {err()}
                    </div>
                  )}
                </Show>
              </>
            }
          >
            <div class="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <div class="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
              {t("skills.loading")}
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}

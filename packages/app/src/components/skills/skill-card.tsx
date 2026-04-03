import { createSignal, Show } from "solid-js";
import { useI18n } from "../../i18n/index.tsx";
import type { SkillManifest } from "../../lib/types";

interface SkillCardProps {
  skill: SkillManifest;
}

export function SkillCard(props: SkillCardProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = createSignal(false);

  return (
    <div class="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--border-focus)]">
      {/* Header */}
      <div class="flex items-start justify-between gap-3">
        <h3 class="font-mono text-sm font-semibold text-[var(--text-primary)]">
          # {props.skill.name}
        </h3>
        <span
          class={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
            props.skill.source === "project"
              ? "bg-[var(--primary-subtle)] text-[var(--primary)]"
              : "bg-[var(--surface-elevated)] text-[var(--text-muted)]"
          }`}
        >
          {props.skill.source === "project"
            ? t("skills.sourceProject")
            : t("skills.sourceUser")}
        </span>
      </div>

      {/* Description */}
      <p class="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
        {props.skill.description}
      </p>

      {/* Instructions preview / expandable */}
      <Show when={props.skill.instructions}>
        <div class="mt-3">
          <Show
            when={expanded()}
            fallback={
              <>
                <p class="line-clamp-4 text-xs leading-relaxed text-[var(--text-muted)]">
                  {props.skill.instructions}
                </p>
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  class="mt-2 text-xs font-medium text-[var(--primary)] transition-colors hover:text-[var(--primary-hover)]"
                >
                  {t("skills.viewInstructions")}
                </button>
              </>
            }
          >
            <div class="max-h-[400px] overflow-y-auto rounded-md bg-[var(--code-background)] p-3">
              <pre class="whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--text-secondary)]">
                {props.skill.instructions}
              </pre>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              class="mt-2 text-xs font-medium text-[var(--primary)] transition-colors hover:text-[var(--primary-hover)]"
            >
              {t("skills.hideInstructions")}
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
}

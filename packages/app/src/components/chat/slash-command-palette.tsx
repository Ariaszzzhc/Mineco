import { For } from "solid-js";
import { useI18n } from "../../i18n/index.tsx";
import type { SkillManifest } from "../../lib/types";

interface SlashCommandPaletteProps {
  skills: SkillManifest[];
  query: string;
  activeIndex: number;
  onSelect: (skill: SkillManifest) => void;
  onHover: (index: number) => void;
}

export function SlashCommandPalette(props: SlashCommandPaletteProps) {
  const { t } = useI18n();

  function highlightMatch(text: string, query: string): string {
    if (!query) return text;
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    const idx = lower.indexOf(q);
    if (idx === -1) return text;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length);
    return `${before}<mark class="rounded bg-[var(--primary-subtle)] text-[var(--text-primary)]">${match}</mark>${after}`;
  }

  return (
    <div class="absolute bottom-full left-0 right-0 mb-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg">
      {/* Header */}
      <div class="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <span class="text-xs font-medium text-[var(--text-muted)]">
          {t("skills.paletteTitle")}
        </span>
        <span class="text-xs text-[var(--text-muted)]">
          ({props.skills.length})
        </span>
      </div>

      {/* List */}
      <div class="max-h-[280px] overflow-y-auto p-1">
        <For each={props.skills}>
          {(skill, index) => (
            <button
              type="button"
              class={`flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors ${
                index() === props.activeIndex
                  ? "bg-[var(--active)]"
                  : "hover:bg-[var(--hover)]"
              }`}
              onClick={() => props.onSelect(skill)}
              onMouseEnter={() => props.onHover(index())}
            >
              <div class="flex items-center gap-2">
                <span
                  class="font-mono text-sm font-medium text-[var(--text-primary)]"
                  innerHTML={highlightMatch(`> ${skill.name}`, props.query)}
                />
                <span
                  class={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    skill.source === "project"
                      ? "bg-[var(--primary-subtle)] text-[var(--primary)]"
                      : "bg-[var(--surface-elevated)] text-[var(--text-muted)]"
                  }`}
                >
                  {skill.source === "project"
                    ? t("skills.sourceProject")
                    : t("skills.sourceUser")}
                </span>
              </div>
              <span
                class="line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]"
                innerHTML={highlightMatch(skill.description, props.query)}
              />
            </button>
          )}
        </For>

        {props.skills.length === 0 && (
          <div class="px-3 py-4 text-center text-xs text-[var(--text-muted)]">
            {t("skills.paletteNoResults")}
          </div>
        )}
      </div>
    </div>
  );
}

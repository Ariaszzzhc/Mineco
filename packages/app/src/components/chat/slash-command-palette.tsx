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

/**
 * Split text into parts around the first match of query.
 * Returns an array of { text, highlight } objects for safe rendering.
 * Safe: uses text nodes only, no innerHTML. Skill name is Zod-validated
 * to [a-z0-9-] only; description is a plain string from backend schema.
 */
function highlightParts(
  text: string,
  query: string,
): Array<{ text: string; highlight: boolean }> {
  if (!query) return [{ text, highlight: false }];
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return [{ text, highlight: false }];

  const parts: Array<{ text: string; highlight: boolean }> = [];
  if (idx > 0) parts.push({ text: text.slice(0, idx), highlight: false });
  parts.push({ text: text.slice(idx, idx + q.length), highlight: true });
  const after = text.slice(idx + q.length);
  if (after) parts.push({ text: after, highlight: false });
  return parts;
}

function HighlightText(props: { text: string; query: string; class: string }) {
  const parts = () => highlightParts(props.text, props.query);
  return (
    <span class={props.class}>
      <For each={parts()}>
        {(part) =>
          part.highlight ? (
            <mark class="rounded bg-[var(--primary-subtle)] text-[var(--text-primary)]">
              {part.text}
            </mark>
          ) : (
            part.text
          )
        }
      </For>
    </span>
  );
}

export function SlashCommandPalette(props: SlashCommandPaletteProps) {
  const { t } = useI18n();

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
                <HighlightText
                  text={`> ${skill.name}`}
                  query={props.query}
                  class="font-mono text-sm font-medium text-[var(--text-primary)]"
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
              <HighlightText
                text={skill.description}
                query={props.query}
                class="line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]"
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

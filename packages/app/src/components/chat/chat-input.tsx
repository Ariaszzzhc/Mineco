import { ArrowUp, Square } from "lucide-solid";
import { createEffect, createSignal, on, Show } from "solid-js";
import { useI18n } from "../../i18n/index.tsx";
import type { SkillManifest } from "../../lib/types";
import { skillStore } from "../../stores/skill-store";
import { workspaceStore } from "../../stores/workspace";
import { SlashCommandPalette } from "./slash-command-palette";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  onSkillActivate?: (skillName: string) => void;
}

export function ChatInput(props: ChatInputProps) {
  const [value, setValue] = createSignal("");
  const [showPalette, setShowPalette] = createSignal(false);
  const [activeIndex, setActiveIndex] = createSignal(0);
  const { t } = useI18n();
  let textareaRef!: HTMLTextAreaElement;

  function resize() {
    const el = textareaRef;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  function getSlashQuery(): string | null {
    const v = value();
    if (!v.startsWith("/")) return null;
    return v.slice(1).trim();
  }

  function filteredSkills(): SkillManifest[] {
    const query = getSlashQuery();
    if (query === null) return [];
    const q = query.toLowerCase();
    const all = skillStore.skills();

    // Sort: name matches first, then description matches
    const nameMatches = all.filter((s) => s.name.toLowerCase().includes(q));
    const descMatches = all
      .filter((s) => !s.name.toLowerCase().includes(q))
      .filter((s) => s.description.toLowerCase().includes(q));

    return [...nameMatches, ...descMatches];
  }

  async function openPaletteIfNeeded() {
    if (value().startsWith("/") && !showPalette()) {
      setShowPalette(true);
      setActiveIndex(0);

      // Lazy load skills on first open
      if (skillStore.skills().length === 0 && !skillStore.loading()) {
        const ws = workspaceStore.currentWorkspace();
        if (ws?.path) {
          await skillStore.loadSkills(ws.path);
        }
      }
    }
  }

  function closePalette() {
    setShowPalette(false);
    setActiveIndex(0);
  }

  function selectSkill(skill: SkillManifest) {
    const newValue = `/${skill.name} `;
    setValue(newValue);
    closePalette();
    props.onSkillActivate?.(skill.name);
    // Focus back and place cursor at end (use local value to avoid signal race)
    setTimeout(() => {
      if (textareaRef) {
        textareaRef.focus();
        textareaRef.setSelectionRange(newValue.length, newValue.length);
      }
    }, 0);
  }

  function handleInput(e: Event) {
    setValue((e.target as HTMLTextAreaElement).value);
    resize();
    openPaletteIfNeeded();
  }

  function handleKeydown(e: KeyboardEvent) {
    // Handle palette keyboard navigation
    if (showPalette()) {
      const skills = filteredSkills();
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) =>
            skills.length > 0 ? (prev + 1) % skills.length : 0,
          );
          return;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) =>
            skills.length > 0 ? (prev - 1 + skills.length) % skills.length : 0,
          );
          return;
        case "Enter": {
          e.preventDefault();
          const selected = skills[activeIndex()];
          if (selected) selectSkill(selected);
          return;
        }
        case "Escape":
          e.preventDefault();
          closePalette();
          return;
      }
    }

    // Default send behavior
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const msg = value().trim();
    if (!msg || props.disabled) return;
    closePalette();
    props.onSend(msg);
    setValue("");
    if (textareaRef) {
      textareaRef.style.height = "auto";
    }
  }

  // Close palette when clicking outside would be handled by the consumer
  // Reset active index when filtered list changes
  createEffect(
    on(filteredSkills, (skills) => {
      if (activeIndex() >= skills.length && skills.length > 0) {
        setActiveIndex(0);
      }
    }),
  );

  return (
    <div class="glass relative border-t border-[var(--border)] px-4 py-3">
      <Show when={showPalette()}>
        <SlashCommandPalette
          skills={filteredSkills()}
          query={getSlashQuery() ?? ""}
          activeIndex={activeIndex()}
          onSelect={selectSkill}
          onHover={setActiveIndex}
        />
      </Show>
      <div class="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 shadow-sm">
        <textarea
          ref={textareaRef}
          value={value()}
          onInput={handleInput}
          onKeyDown={handleKeydown}
          placeholder={t("chat.placeholder")}
          disabled={props.disabled || props.isStreaming}
          rows={1}
          class="max-h-[200px] min-h-[24px] flex-1 resize-none bg-transparent py-1 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
        />
        {props.isStreaming ? (
          <button
            type="button"
            onClick={props.onStop}
            class="rounded-lg bg-[var(--error)] p-2 text-[var(--on-error)] transition-colors hover:opacity-90"
            aria-label={t("chat.stopStreaming")}
          >
            <Square size={16} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={!value().trim() || props.disabled}
            class="rounded-lg bg-[var(--primary)] p-2 text-[var(--on-primary)] transition-colors hover:bg-[var(--primary-hover)] disabled:opacity-40"
            aria-label={t("chat.sendMessage")}
          >
            <ArrowUp size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

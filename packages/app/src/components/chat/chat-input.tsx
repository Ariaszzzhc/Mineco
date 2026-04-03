import { ArrowUp, Square } from "lucide-solid";
import { createSignal } from "solid-js";
import { useI18n } from "../../i18n/index.tsx";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export function ChatInput(props: ChatInputProps) {
  const [value, setValue] = createSignal("");
  const { t } = useI18n();
  let textareaRef!: HTMLTextAreaElement;

  function resize() {
    const el = textareaRef;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  function handleInput(e: Event) {
    setValue((e.target as HTMLTextAreaElement).value);
    resize();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const msg = value().trim();
    if (!msg || props.disabled) return;
    props.onSend(msg);
    setValue("");
    if (textareaRef) {
      textareaRef.style.height = "auto";
    }
  }

  return (
    <div class="glass border-t border-[var(--border)] px-4 py-3">
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

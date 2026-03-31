import { Collapsible } from "@ark-ui/solid";
import { Brain, ChevronRight } from "lucide-solid";
import { createEffect, createSignal, Show } from "solid-js";
import { renderMarkdown } from "../../lib/markdown";

interface ThinkingBlockProps {
  text: string;
  isStreaming?: boolean;
}

export function ThinkingBlock(props: ThinkingBlockProps) {
  const [wasAutoExpanded, setWasAutoExpanded] = createSignal(false);

  // Auto-expand once when streaming content arrives
  createEffect(() => {
    if (props.isStreaming && props.text.trim() && !wasAutoExpanded()) {
      setWasAutoExpanded(true);
    }
  });

  const defaultOpen = () =>
    props.isStreaming ? wasAutoExpanded() : false;

  return (
    <Show when={props.text.trim()}>
      <Collapsible.Root open={defaultOpen() || undefined}>
        <Collapsible.Trigger class="group flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--hover)]">
          <Show
            when={props.isStreaming}
            fallback={
              <Brain
                size={13}
                class="text-[var(--text-muted)] transition-colors group-data-[state=open]:text-[var(--text-secondary)]"
                stroke-width={2}
              />
            }
          >
            <Brain
              size={13}
              class="animate-pulse-dot text-[var(--primary)]"
              stroke-width={2}
            />
          </Show>
          <span class="font-medium tracking-wide text-[var(--text-muted)] transition-colors group-data-[state=open]:text-[var(--text-secondary)]">
            <Show when={props.isStreaming} fallback="Thinking Process">
              Thinking...
            </Show>
          </span>
          <ChevronRight
            size={12}
            class="text-[var(--text-muted)] opacity-60 transition-transform group-data-[state=open]:rotate-90"
            stroke-width={2}
          />
        </Collapsible.Trigger>
        <Collapsible.Content>
          <div class="ml-[22px] border-l-2 border-[var(--border)] py-1 pl-3">
            <div
              class="prose max-w-none text-xs leading-relaxed text-[var(--text-muted)] [&_code]:text-[0.8em] [&_pre]:text-[0.75em]"
              innerHTML={renderMarkdown(props.text)}
            />
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </Show>
  );
}

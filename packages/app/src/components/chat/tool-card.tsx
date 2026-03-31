import { Collapsible } from "@ark-ui/solid";
import { CheckCircle, ChevronRight, Loader, XCircle } from "lucide-solid";
import { Show } from "solid-js";
import type { ToolCallEvent, ToolResultEvent } from "../../lib/types";

interface ToolCardProps {
  call?: ToolCallEvent | undefined;
  result?: ToolResultEvent | undefined;
}

export function ToolCard(props: ToolCardProps) {
  const name = () => props.call?.toolName ?? props.result?.toolName ?? "tool";
  const isDone = () => props.result !== undefined;
  const isError = () => props.result?.isError === true;

  return (
    <Collapsible.Root>
      <Collapsible.Trigger class="group flex w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--hover)]">
        <Collapsible.Indicator>
          <ChevronRight
            size={14}
            class="text-[var(--text-muted)] transition-transform group-data-[state=open]:rotate-90"
          />
        </Collapsible.Indicator>
        <span class="flex-1 font-mono text-xs text-[var(--text-secondary)]">
          {name()}
        </span>
        <Show when={!isDone()}>
          <Loader size={14} class="animate-pulse-dot text-[var(--primary)]" />
        </Show>
        <Show when={isDone() && !isError()}>
          <CheckCircle size={14} class="text-[var(--success)]" />
        </Show>
        <Show when={isDone() && isError()}>
          <XCircle size={14} class="text-[var(--error)]" />
        </Show>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <div class="mt-1 rounded-lg border border-[var(--border)] bg-[var(--code-background)] p-3 text-xs">
          <Show
            when={props.call?.args && Object.keys(props.call.args).length > 0}
          >
            <div class="mb-2">
              <div class="mb-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Arguments
              </div>
              <pre class="overflow-x-auto whitespace-pre-wrap text-[var(--text-secondary)]">
                {JSON.stringify(props.call?.args, null, 2)}
              </pre>
            </div>
          </Show>
          <Show when={props.result}>
            <div>
              <div class="mb-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Result
              </div>
              <pre
                class="max-h-[300px] overflow-auto whitespace-pre-wrap text-[var(--text-secondary)]"
                classList={{ "text-[var(--error)]": isError() }}
              >
                {props.result?.result}
              </pre>
            </div>
          </Show>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

import { CheckCircle, Loader, XCircle } from "lucide-solid";
import { Show } from "solid-js";
import type { SubagentRunState } from "../../stores/chat";

interface SubagentCardProps {
  run: SubagentRunState;
  onClick: () => void;
}

const agentIcons: Record<string, string> = {
  explore: "\u{1F50D}",
};

function agentLabel(agentType: string): string {
  const parts = agentType.split("-");
  return parts.map((p) => (p[0] ?? "").toUpperCase() + p.slice(1)).join(" ");
}

export function SubagentCard(props: SubagentCardProps) {
  const icon = () => agentIcons[props.run.agentType] ?? "\u{1F916}";
  const label = () => agentLabel(props.run.agentType);
  const isRunning = () => props.run.status === "running";
  const isCompleted = () => props.run.status === "completed";
  const isError = () => props.run.status === "error";

  return (
    <button
      type="button"
      onClick={props.onClick}
      class="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--hover)] cursor-pointer"
      classList={{
        "border-[var(--error)]": isError(),
      }}
    >
      <span class="text-base">{icon()}</span>
      <span class="flex-1 font-mono text-xs text-[var(--text-secondary)]">
        {label()}
      </span>
      <Show when={isRunning()}>
        <Loader size={14} class="animate-pulse-dot text-[var(--primary)]" />
      </Show>
      <Show when={isCompleted()}>
        <CheckCircle size={14} class="text-[var(--success)]" />
      </Show>
      <Show when={isError()}>
        <XCircle size={14} class="text-[var(--error)]" />
      </Show>
    </button>
  );
}

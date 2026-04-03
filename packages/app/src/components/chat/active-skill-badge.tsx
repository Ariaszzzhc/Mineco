import { X } from "lucide-solid";

interface ActiveSkillBadgeProps {
  skillName: string;
  onDismiss: () => void;
}

export function ActiveSkillBadge(props: ActiveSkillBadgeProps) {
  return (
    <div class="mx-auto max-w-3xl px-4 pb-1">
      <div class="inline-flex items-center gap-1.5 rounded-md bg-[var(--primary-subtle)] px-2.5 py-1 text-xs">
        <span class="font-mono font-medium text-[var(--primary)]">
          /{props.skillName}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            props.onDismiss();
          }}
          class="rounded p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          aria-label="Dismiss skill"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

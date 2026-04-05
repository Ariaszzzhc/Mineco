import { For, Show } from "solid-js";
import type { SkillManifest } from "../../lib/types";
import { SkillCard } from "./skill-card";

interface SkillGroupSectionProps {
  title: string;
  skills: SkillManifest[];
}

export function SkillGroupSection(props: SkillGroupSectionProps) {
  return (
    <Show when={props.skills.length > 0}>
      <section class="mt-6 first:mt-0">
        <h2 class="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          {props.title}
          <span class="rounded-full bg-[var(--surface-elevated)] px-2 py-0.5 text-xs font-normal text-[var(--text-muted)]">
            {props.skills.length}
          </span>
        </h2>
        <div class="flex flex-col gap-3">
          <For each={props.skills}>
            {(skill) => <SkillCard skill={skill} />}
          </For>
        </div>
      </section>
    </Show>
  );
}

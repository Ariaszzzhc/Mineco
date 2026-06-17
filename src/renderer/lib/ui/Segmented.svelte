<!--
  Segmented — small custom button-group / segmented control (no bits-ui dep).

  Props:
    value     : string ($bindable) — selected option value
    options   : { value: string; label: string; disabled?: boolean }[]
    size?     : 'sm' | 'md'  (default 'md')
    class?    : extra classes on the group container
    onchange? : (value: string) => void

  Used for theme/platform/run-mode toggles. Accent-tinted active segment.
-->
<script lang="ts">
let {
  value = $bindable(""),
  options,
  size = "md" as "sm" | "md",
  class: className = "",
  onchange,
}: {
  value?: string;
  options: { value: string; label: string; disabled?: boolean }[];
  size?: "sm" | "md";
  class?: string;
  onchange?: (value: string) => void;
} = $props();

function pick(v: string) {
  if (v === value) return;
  value = v;
  onchange?.(v);
}

const pad = $derived(
  size === "sm" ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-[12px]",
);
</script>

<div
  role="radiogroup"
  class={`inline-flex items-center gap-0.5 rounded-[var(--r-field)] border border-line-2 bg-chrome-2 p-0.5 ${className}`}
>
  {#each options as opt (opt.value)}
    <button
      type="button"
      role="radio"
      aria-checked={value === opt.value}
      disabled={opt.disabled}
      onclick={() => pick(opt.value)}
      class={`mc-no-drag rounded-[calc(var(--r-field)-3px)] font-medium outline-none transition-colors disabled:opacity-40 ${pad} ${
        value === opt.value
          ? "bg-accent-bg text-accent-tx"
          : "text-ink-2 hover:text-ink"
      }`}
    >
      {opt.label}
    </button>
  {/each}
</div>

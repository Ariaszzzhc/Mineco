<!--
  ApprovalCard — renders a tool-write approval request.
  Shows title, an optional colorized unified diff, and Allow / Deny buttons.
  Deny reveals an optional message textarea before confirming.
  Mirrors the QuestionCard style (card-2 surface, accent tint on selected).
-->
<script lang="ts">
import { i18n } from "@/renderer/lib/stores/i18n.svelte";

type DiffInfo = {
  path: string;
  added: number;
  removed: number;
  patch?: string;
};

type ApprovalProps = {
  approvalId: string;
  title: string;
  diff?: DiffInfo;
};

type DecisionPayload = {
  approve: boolean;
  message?: string;
};

let {
  approval,
  disabled = false,
  ondecision,
}: {
  approval: ApprovalProps;
  disabled?: boolean;
  ondecision: (d: DecisionPayload) => void;
} = $props();

/** Whether the user clicked Deny (reveals the reason textarea). */
let denyMode = $state(false);
/** Optional message when denying. */
let denyMessage = $state("");
/** Whether we've already fired ondecision (lock out further interaction). */
let decided = $state(false);

function allow() {
  if (decided || disabled) return;
  decided = true;
  ondecision({ approve: true });
}

function startDeny() {
  if (decided || disabled) return;
  denyMode = true;
}

function confirmDeny() {
  if (decided || disabled) return;
  decided = true;
  ondecision({ approve: false, message: denyMessage.trim() || undefined });
}

function cancelDeny() {
  denyMode = false;
  denyMessage = "";
}

/** Parse a unified diff string into annotated line records. */
type DiffLine = { kind: "add" | "remove" | "hunk" | "context"; text: string };

function parsePatch(patch: string): DiffLine[] {
  return patch.split("\n").map((raw) => {
    if (raw.startsWith("@@")) return { kind: "hunk", text: raw };
    if (raw.startsWith("+")) return { kind: "add", text: raw.slice(1) };
    if (raw.startsWith("-")) return { kind: "remove", text: raw.slice(1) };
    return { kind: "context", text: raw.startsWith(" ") ? raw.slice(1) : raw };
  });
}

const diffLines = $derived(
  approval.diff?.patch ? parsePatch(approval.diff.patch) : null,
);

/** Textarea should be read-only once decided or externally disabled. */
const textareaDisabled = $derived(disabled || decided);
</script>

<div
  class="flex w-full flex-col gap-3 rounded-[var(--r-card)] border border-line-2 bg-card-2/40 p-3 [animation:p-rise_.4s_cubic-bezier(.2,.7,.3,1)_both]"
>
  <!-- Header row -->
  <div class="flex flex-col gap-0.5">
    <span
      class="font-mono text-[10px] font-semibold uppercase tracking-[.09em] text-ink-3"
    >
      {i18n.t("approval.eyebrow")}
    </span>
    <span class="text-[13.5px] font-semibold text-ink leading-snug">
      {approval.title}
    </span>
  </div>

  <!-- Diff summary badge (always shown if diff present) -->
  {#if approval.diff}
    <div class="flex items-center gap-2 font-mono text-[11px]">
      <span class="text-ink-2 truncate">{approval.diff.path}</span>
      {#if approval.diff.added > 0}
        <span class="text-[var(--ok)] font-semibold">+{approval.diff.added}</span>
      {/if}
      {#if approval.diff.removed > 0}
        <span class="text-[var(--del)] font-semibold">-{approval.diff.removed}</span>
      {/if}
    </div>
  {/if}

  <!-- Unified diff viewer -->
  {#if diffLines && diffLines.length > 0}
    <div
      class="overflow-x-auto rounded-[var(--r-field)] border border-line-2 bg-[var(--canvas)]"
    >
      <pre class="m-0 p-2 font-mono text-[11px] leading-[1.6] select-text">{#each diffLines as line}<span
          class="block whitespace-pre"
          class:mc-diff-add={line.kind === "add"}
          class:mc-diff-remove={line.kind === "remove"}
          class:mc-diff-hunk={line.kind === "hunk"}
          class:mc-diff-context={line.kind === "context"}
        >{line.kind === "add" ? "+" : line.kind === "remove" ? "-" : line.kind === "hunk" ? "" : " "}{line.kind === "hunk" ? line.text : line.text}</span>{/each}</pre>
    </div>
  {/if}

  <!-- Deny reason textarea (shown after clicking Deny) -->
  {#if denyMode && !decided}
    <div class="flex flex-col gap-1.5">
      <label
        for="approval-deny-msg"
        class="font-mono text-[10px] font-semibold uppercase tracking-[.09em] text-ink-3"
      >
        {i18n.t("approval.reason")}
      </label>
      <textarea
        id="approval-deny-msg"
        bind:value={denyMessage}
        rows={3}
        placeholder={i18n.t("approval.reasonPlaceholder")}
        disabled={textareaDisabled}
        class="mc-no-drag w-full resize-none rounded-[var(--r-field)] border border-line-2 bg-card px-2.5 py-2 font-[var(--ui)] text-[12.5px] text-ink placeholder:text-ink-3 outline-none focus:border-[var(--accent-ln)] transition-colors disabled:opacity-50"
      ></textarea>
    </div>
  {/if}

  <!-- Action buttons -->
  {#if !decided && !disabled}
    <div class="flex items-center gap-2">
      {#if denyMode}
        <!-- Deny confirm flow -->
        <button
          type="button"
          onclick={confirmDeny}
          class="mc-no-drag flex-none rounded-[var(--r-field)] border border-[var(--del)] bg-[color-mix(in_oklab,var(--del)_14%,var(--canvas))] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--del)] transition-colors hover:bg-[color-mix(in_oklab,var(--del)_22%,var(--canvas))]"
        >
          {i18n.t("approval.denyConfirm")}
        </button>
        <button
          type="button"
          onclick={cancelDeny}
          class="mc-no-drag flex-none rounded-[var(--r-field)] border border-line-2 bg-card-2 px-3 py-1.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:text-ink"
        >
          {i18n.t("cancel")}
        </button>
      {:else}
        <!-- Initial Allow / Deny -->
        <button
          type="button"
          onclick={allow}
          class="mc-no-drag flex-none rounded-[var(--r-field)] bg-[var(--accent)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--canvas)] transition-colors hover:bg-[var(--accent-dk)]"
        >
          {i18n.t("approval.allow")}
        </button>
        <button
          type="button"
          onclick={startDeny}
          class="mc-no-drag flex-none rounded-[var(--r-field)] border border-line-2 bg-card-2 px-3 py-1.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-[var(--del)] hover:text-[var(--del)]"
        >
          {i18n.t("approval.deny")}
        </button>
      {/if}
    </div>
  {:else}
    <!-- Decided or externally disabled (cancelled by abort) -->
    <div
      class="inline-flex items-center gap-1.5 rounded-[var(--r-field)] border border-line-2 bg-card-2 px-2.5 py-1.5 text-[12px] font-medium text-ink-3"
    >
      {disabled && !decided ? i18n.t("approval.cancelled") : i18n.t("approval.decided")}
    </div>
  {/if}
</div>

<style>
  .mc-diff-add {
    background-color: color-mix(in oklab, var(--ok) 12%, transparent);
    color: var(--ok);
  }
  .mc-diff-remove {
    background-color: color-mix(in oklab, var(--del) 12%, transparent);
    color: var(--del);
  }
  .mc-diff-hunk {
    color: var(--ink-3);
    background-color: color-mix(in oklab, var(--accent) 8%, transparent);
  }
  .mc-diff-context {
    color: var(--ink-2);
  }
</style>

<!--
  QuestionCard — renders a structured question from the agent that needs a
  human answer before the turn can continue. Two variants:
    kind="single"  -> radio list; auto-submits on pick.
    kind="multi"   -> checkbox list + footer counter + explicit Submit button.
  allowFreeText adds a "Something else…" row that reveals a text input;
  its value becomes freeText in the answer payload.
  disabled=true shows a muted "Cancelled" banner — no interaction.
-->
<script lang="ts">
import { i18n } from "@/renderer/lib/stores/i18n.svelte";

// --------------------------------------------------------------------------
// Local types (self-contained — no agent-protocol import)
// --------------------------------------------------------------------------
interface QuestionOption {
  id: string;
  label: string;
  recommended?: boolean;
}

interface Question {
  questionId: string;
  kind: "single" | "multi";
  prompt: string;
  options: QuestionOption[];
  allowFreeText: boolean;
}

interface AnswerPayload {
  optionIds: string[];
  freeText?: string;
}

// --------------------------------------------------------------------------
// Props
// --------------------------------------------------------------------------
let {
  question,
  disabled = false,
  onanswer,
}: {
  question: Question;
  disabled?: boolean;
  onanswer: (a: AnswerPayload) => void;
} = $props();

// --------------------------------------------------------------------------
// Local state
// --------------------------------------------------------------------------
let checkedIds = $state<Set<string>>(new Set());
let freeTextOpen = $state(false);
let freeTextValue = $state("");

// For single: which option id is selected (or "free" for the free-text row)
let singleSelected = $state<string | null>(null);

// Derived: count of selected for multi footer
const selectedCount = $derived(
  checkedIds.size + (freeTextOpen && freeTextValue.trim() ? 1 : 0),
);

// --------------------------------------------------------------------------
// Handlers
// --------------------------------------------------------------------------
function pickSingle(id: string) {
  if (disabled) return;
  singleSelected = id;
  freeTextOpen = false;
  freeTextValue = "";
  onanswer({ optionIds: [id] });
}

function pickSingleFree() {
  if (disabled) return;
  singleSelected = "free";
  freeTextOpen = true;
}

function submitSingleFree() {
  if (disabled) return;
  const ft = freeTextValue.trim();
  if (!ft) return;
  onanswer({ optionIds: [], freeText: ft });
}

function toggleMulti(id: string) {
  if (disabled) return;
  // Svelte 5: mutate the Set then reassign so the proxy sees the change
  const next = new Set(checkedIds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  checkedIds = next;
}

function toggleFreeText() {
  if (disabled) return;
  freeTextOpen = !freeTextOpen;
  if (!freeTextOpen) freeTextValue = "";
}

function submitMulti() {
  if (disabled) return;
  const optionIds = [...checkedIds];
  const ft = freeTextOpen ? freeTextValue.trim() : undefined;
  if (optionIds.length === 0 && !ft) return;
  onanswer({ optionIds, freeText: ft || undefined });
}
</script>

<div
  class="qcard flex flex-col gap-3 rounded-[var(--r-card)] border border-line-2 bg-card p-4 [animation:p-rise_.4s_cubic-bezier(.2,.7,.3,1)_both]"
  class:qcard--disabled={disabled}
>
  <!-- eyebrow -->
  {#if question.kind === "multi"}
    <span
      class="self-start rounded-[var(--r-field)] bg-card-2 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[.09em] text-ink-3"
    >
      {i18n.t("question.optional")}
    </span>
  {/if}

  <!-- prompt -->
  <p class="m-0 text-[13.5px] leading-[1.55] text-ink [text-wrap:pretty]">
    {question.prompt}
  </p>

  {#if disabled}
    <!-- Cancelled state -->
    <div
      class="flex items-center gap-2 rounded-[var(--r-field)] border border-line-2 bg-card-2/60 px-3 py-2 text-[12.5px] text-ink-3"
    >
      <span class="mc-cancel-icon">✕</span>
      {i18n.t("question.cancelled")}
    </div>
  {:else}
    <!-- Options list -->
    <div class="flex flex-col gap-1">
      {#each question.options as opt (opt.id)}
        {@const isChecked =
          question.kind === "single"
            ? singleSelected === opt.id
            : checkedIds.has(opt.id)}
        <button
          type="button"
          onclick={() =>
            question.kind === "single" ? pickSingle(opt.id) : toggleMulti(opt.id)}
          class="option-row mc-no-drag flex w-full items-center gap-3 rounded-[var(--r-field)] border px-3 py-2.5 text-left transition-colors"
          class:option-row--selected={isChecked}
          class:option-row--unselected={!isChecked}
        >
          <!-- indicator -->
          <span
            class="indicator flex-none"
            class:indicator--radio={question.kind === "single"}
            class:indicator--checkbox={question.kind === "multi"}
            class:indicator--on={isChecked}
          >
            {#if isChecked}
              {#if question.kind === "single"}
                <span class="radio-dot"></span>
              {:else}
                <span class="check-mark">✓</span>
              {/if}
            {/if}
          </span>

          <!-- label -->
          <span class="flex-1 text-[13px] leading-snug" class:text-ink={isChecked} class:text-ink-2={!isChecked}>
            {opt.label}
          </span>

          <!-- recommended badge -->
          {#if opt.recommended}
            <span
              class="flex-none rounded-[var(--r-field)] bg-accent-bg px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[.06em] text-accent-tx"
            >
              {i18n.t("question.recommended")}
            </span>
          {/if}
        </button>
      {/each}

      <!-- free-text row -->
      {#if question.allowFreeText}
        {@const ftSelected =
          question.kind === "single"
            ? singleSelected === "free"
            : freeTextOpen}
        <button
          type="button"
          onclick={() =>
            question.kind === "single" ? pickSingleFree() : toggleFreeText()}
          class="option-row mc-no-drag flex w-full items-center gap-3 rounded-[var(--r-field)] border px-3 py-2.5 text-left transition-colors"
          class:option-row--selected={ftSelected}
          class:option-row--unselected={!ftSelected}
        >
          <span
            class="indicator flex-none"
            class:indicator--radio={question.kind === "single"}
            class:indicator--checkbox={question.kind === "multi"}
            class:indicator--on={ftSelected}
          >
            {#if ftSelected}
              {#if question.kind === "single"}
                <span class="radio-dot"></span>
              {:else}
                <span class="check-mark">✓</span>
              {/if}
            {/if}
          </span>
          <span class="flex-1 text-[13px] leading-snug" class:text-ink={ftSelected} class:text-ink-2={!ftSelected}>
            {i18n.t("question.somethingElse")}
          </span>
        </button>

        {#if freeTextOpen}
          <div class="mt-1 flex flex-col gap-2 pl-1">
            <textarea
              rows={2}
              placeholder={i18n.t("question.typeYourOwn")}
              bind:value={freeTextValue}
              class="mc-no-drag w-full resize-none rounded-[var(--r-field)] border border-line-2 bg-card-2 px-3 py-2 text-[13px] text-ink placeholder:text-ink-3 outline-none focus:border-accent-ln transition-colors"
            ></textarea>
            {#if question.kind === "single"}
              <button
                type="button"
                onclick={submitSingleFree}
                disabled={!freeTextValue.trim()}
                class="mc-no-drag self-end rounded-[var(--r-field)] bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-40"
              >
                {i18n.t("question.submit")}
              </button>
            {/if}
          </div>
        {/if}
      {/if}
    </div>

    <!-- multi footer -->
    {#if question.kind === "multi"}
      <div class="flex items-center justify-between border-t border-line-2 pt-3">
        <span class="text-[12px] text-ink-3">
          {selectedCount}
          {i18n.t("question.selected")}
        </span>
        <button
          type="button"
          onclick={submitMulti}
          disabled={selectedCount === 0}
          class="mc-no-drag rounded-[var(--r-field)] bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {i18n.t("question.submit")}
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .qcard--disabled {
    opacity: 0.55;
    pointer-events: none;
  }

  /* option rows */
  .option-row--selected {
    background: var(--accent-bg);
    border-color: var(--accent-ln);
  }
  .option-row--unselected {
    background: var(--card-2);
    border-color: var(--line-2);
  }
  .option-row--unselected:hover {
    background: var(--raised);
    border-color: var(--line-3);
  }

  /* radio indicator */
  .indicator {
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1.5px solid var(--line-3);
    background: transparent;
    transition:
      border-color 0.12s ease,
      background 0.12s ease;
  }
  .indicator--checkbox {
    border-radius: 4px;
  }
  .indicator--on {
    border-color: var(--accent);
    background: var(--accent);
  }

  .radio-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #fff;
  }

  .check-mark {
    font-size: 10px;
    line-height: 1;
    color: #fff;
    font-weight: 700;
  }

  .mc-cancel-icon {
    font-size: 11px;
    opacity: 0.7;
  }
</style>

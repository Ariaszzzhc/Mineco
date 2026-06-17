<!--
  WorkspaceSwitcher — sidebar popover that lists workspaces and lets the user
  add a new one via the native directory picker. Lives inside the Home sidebar.
-->
<script lang="ts">
import { i18n } from "../../stores/i18n.svelte";
import Icon from "../../ui/Icon.svelte";
import { Popover } from "bits-ui";
import { workspaces } from "../../stores/workspace.svelte";

let open = $state(false);

async function pickAndCreate() {
  const path = await workspaces.pickDirectory();
  if (!path) return;
  // Derive a name from the last path segment(s)
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  const name =
    parts.slice(-2).join("/") || parts[parts.length - 1] || "workspace";
  open = false;
  await workspaces.create({ name, rootPath: path });
}

function select(id: string) {
  workspaces.setCurrent(id);
  open = false;
}
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    class="mc-no-drag flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border border-line bg-card px-2.5 py-[7px] text-left transition-colors hover:border-line-3 hover:bg-card-2 outline-none"
    title={i18n.t("workspace")}
  >
    <!-- icon -->
    <span class="grid size-[26px] flex-none place-items-center rounded-[7px] border border-accent-ln bg-accent-bg text-accent-tx">
      <Icon name="ws" size={15} stroke={1.8} />
    </span>
    <!-- text -->
    <span class="flex min-w-0 flex-1 flex-col">
      <span class="truncate text-[13px] font-[650] text-ink">
        {#if workspaces.current}
          {workspaces.current.name}
        {:else}
          {i18n.t("workspace.none")}
        {/if}
      </span>
      <span class="font-mono text-[9px] font-semibold uppercase tracking-[.1em] text-ink-3">
        {i18n.t("workspace")}
      </span>
    </span>
    <!-- chevron -->
    <span class="flex-none text-ink-3">
      <Icon name="chev" size={12} stroke={2.4} />
    </span>
  </Popover.Trigger>

  <Popover.Portal>
    <Popover.Content
      side="bottom"
      align="start"
      sideOffset={6}
      class="z-50 w-[220px] rounded-[12px] border border-line-3 bg-card p-[5px] shadow-[0_18px_44px_-16px_rgba(20,18,14,.45)] outline-none [animation:pop_.16s_cubic-bezier(.2,.8,.3,1)_both]"
    >
      <!-- caption -->
      <div class="px-[9px] pb-[5px] pt-[7px] font-mono text-[9.5px] font-semibold uppercase tracking-[.1em] text-ink-3">
        {i18n.t("workspace")}
      </div>

      <!-- public / shared option -->
      <button
        type="button"
        onclick={() => select("")}
        class={`flex w-full cursor-pointer items-center gap-[9px] rounded-[8px] border-none px-[9px] py-[7px] text-left font-[var(--ui)] transition-colors ${!workspaces.currentId ? "bg-card-2" : "bg-transparent hover:bg-card-2"}`}
      >
        <span class={`grid size-6 flex-none place-items-center rounded-[7px] border ${!workspaces.currentId ? "border-accent-ln bg-accent-bg text-accent-tx" : "border-line bg-raised text-ink-2"}`}>
          <Icon name="ws" size={14} stroke={1.8} />
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-px">
          <span class="text-[12.5px] font-semibold text-ink">{i18n.t("workspace.shared")}</span>
          <span class="truncate font-mono text-[10px] text-ink-3">Public / scratch</span>
        </span>
        <span class={`flex-none text-accent-tx transition-opacity ${!workspaces.currentId ? "opacity-100" : "opacity-0"}`}>
          <Icon name="check" size={13} stroke={2.6} />
        </span>
      </button>

      <!-- workspace list -->
      {#each workspaces.items as ws (ws.id)}
        {@const isSel = ws.id === workspaces.currentId}
        <button
          type="button"
          onclick={() => select(ws.id)}
          class={`flex w-full cursor-pointer items-center gap-[9px] rounded-[8px] border-none px-[9px] py-[7px] text-left font-[var(--ui)] transition-colors ${isSel ? "bg-card-2" : "bg-transparent hover:bg-card-2"}`}
        >
          <span class={`grid size-6 flex-none place-items-center rounded-[7px] border ${isSel ? "border-accent-ln bg-accent-bg text-accent-tx" : "border-line bg-raised text-ink-2"}`}>
            <Icon name="ws" size={14} stroke={1.8} />
          </span>
          <span class="flex min-w-0 flex-1 flex-col gap-px">
            <span class="text-[12.5px] font-semibold text-ink">{ws.name}</span>
            <span class="truncate font-mono text-[10px] text-ink-3">
              {ws.rootPath || i18n.t("workspace.shared")}
            </span>
          </span>
          <span class={`flex-none text-accent-tx transition-opacity ${isSel ? "opacity-100" : "opacity-0"}`}>
            <Icon name="check" size={13} stroke={2.6} />
          </span>
        </button>
      {/each}

      <!-- empty state -->
      {#if workspaces.items.length === 0}
        <div class="px-[9px] py-[7px] text-[12px] text-ink-3">
          {i18n.t("empty.noWorkspaces")}
        </div>
      {/if}

      <!-- add workspace -->
      <div class="mx-1 mt-1 border-t border-line pt-1">
        <button
          type="button"
          onclick={pickAndCreate}
          class="flex w-full cursor-pointer items-center gap-[9px] rounded-[8px] border-none bg-transparent px-[9px] py-[7px] text-left font-[var(--ui)] transition-colors hover:bg-card-2"
        >
          <span class="grid size-6 flex-none place-items-center rounded-[7px] border border-line bg-raised text-ink-2">
            <Icon name="plus" size={13} stroke={2} />
          </span>
          <span class="text-[12.5px] font-medium text-ink-2">
            {i18n.t("workspace.add")}…
          </span>
        </button>
      </div>

      <!-- footer hint -->
      <div class="px-[9px] pb-1 pt-[7px] text-[10.5px] leading-relaxed text-ink-3">
        Switching swaps memory, tool scope &amp; history
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

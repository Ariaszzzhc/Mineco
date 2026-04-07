import type { JSX } from "solid-js";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";

interface DropdownItem {
  label: string;
  icon?: JSX.Element;
  onClick: () => void;
  disabled?: boolean;
}

interface DropdownProps {
  trigger: JSX.Element;
  items: DropdownItem[];
  align?: "left" | "right";
}

export function Dropdown(props: DropdownProps) {
  const [open, setOpen] = createSignal(false);

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    setOpen((prev) => !prev);
  }

  function handleClickOutside() {
    setOpen(false);
  }

  // Register click-outside listener when open
  createEffect(() => {
    if (open()) {
      // Defer so the current click doesn't immediately close
      setTimeout(
        () => document.addEventListener("click", handleClickOutside),
        0,
      );
    } else {
      document.removeEventListener("click", handleClickOutside);
    }
  });

  // Cleanup on destroy
  onCleanup(() => {
    document.removeEventListener("click", handleClickOutside);
  });

  return (
    <div class="relative">
      <button
        type="button"
        class="flex items-center"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        {props.trigger}
      </button>
      <Show when={open()}>
        <div
          classList={{
            "absolute top-full z-50 mt-1 min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg": true,
            "left-0": props.align !== "right",
            "right-0": props.align === "right",
          }}
        >
          {props.items.map((item) => (
            <button
              type="button"
              disabled={item.disabled}
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--hover)] disabled:opacity-50 disabled:pointer-events-none"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                document.removeEventListener("click", handleClickOutside);
                item.onClick();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </Show>
    </div>
  );
}

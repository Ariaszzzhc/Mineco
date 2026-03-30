import type { JSX } from "solid-js";

interface ButtonProps {
  children: JSX.Element;
  onClick?: (e: MouseEvent) => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  disabled?: boolean;
  class?: string;
  type?: "button" | "submit";
}

const variantStyles: Record<string, string> = {
  primary:
    "bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary-hover)]",
  secondary:
    "bg-[var(--surface-elevated)] text-[var(--text-primary)] hover:bg-[var(--active)] border border-[var(--border)]",
  ghost:
    "text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text-primary)]",
  danger:
    "bg-[var(--error)] text-[var(--on-error)] hover:opacity-90",
};

const sizeStyles: Record<string, string> = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-3.5 py-2 text-sm",
};

export function Button(props: ButtonProps) {
  return (
    <button
      type={props.type ?? "button"}
      onClick={props.onClick}
      disabled={props.disabled}
      class={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${variantStyles[props.variant ?? "secondary"]} ${sizeStyles[props.size ?? "md"]} ${props.class ?? ""}`}
    >
      {props.children}
    </button>
  );
}

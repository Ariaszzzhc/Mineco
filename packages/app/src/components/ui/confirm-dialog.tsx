import { useI18n } from "../../i18n/index.tsx";
import { Button } from "./button.tsx";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const { t } = useI18n();

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        class="absolute inset-0 bg-black/40"
        onClick={props.onCancel}
      />
      {/* Dialog */}
      <div class="glass relative z-10 w-full max-w-sm rounded-xl border border-[var(--border)] p-5 shadow-xl">
        <h3 class="text-sm font-semibold text-[var(--text-primary)]">
          {props.title}
        </h3>
        <p class="mt-2 text-sm text-[var(--text-secondary)]">{props.message}</p>
        <div class="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={props.onCancel}>
            {props.cancelLabel ?? t("common.cancel")}
          </Button>
          <Button
            variant={props.variant ?? "danger"}
            size="sm"
            onClick={props.onConfirm}
          >
            {props.confirmLabel ?? t("common.confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}

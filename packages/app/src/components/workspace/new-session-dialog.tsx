import { createSignal } from "solid-js";
import { useI18n } from "../../i18n/index.tsx";
import { Button } from "../ui/button.tsx";

interface NewSessionDialogProps {
  defaultBranchName: string;
  onCreate: (branchName: string) => void;
  onCancel: () => void;
}

export function NewSessionDialog(props: NewSessionDialogProps) {
  const { t } = useI18n();
  const [branchName, setBranchName] = createSignal(props.defaultBranchName);

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
          {t("workspace.newSession.worktree")}
        </h3>

        <div class="mt-4">
          <label
            for="branchName"
            class="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
          >
            {t("workspace.worktree.branchName")}
          </label>
          <input
            id="branchName"
            type="text"
            value={branchName()}
            onInput={(e) => setBranchName(e.currentTarget.value)}
            placeholder={t("workspace.worktree.branchPlaceholder")}
            class="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-focus)] focus:outline-none"
          />
        </div>

        <div class="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={props.onCancel}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              const name = branchName().trim();
              if (name) {
                props.onCreate(name);
              }
            }}
            disabled={!branchName().trim()}
          >
            {t("workspace.worktree.create")}
          </Button>
        </div>
      </div>
    </div>
  );
}

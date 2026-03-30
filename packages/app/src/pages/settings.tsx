import { useNavigate } from "@solidjs/router";
import { ArrowLeft } from "lucide-solid";
import { onMount } from "solid-js";
import { ProviderList } from "../components/settings/provider-list";
import { ProviderForm } from "../components/settings/provider-form";
import { SettingsForm } from "../components/settings/settings-form";
import { configStore } from "../stores/config";

export function SettingsPage() {
  const navigate = useNavigate();

  onMount(() => {
    if (!configStore.config()) {
      configStore.loadConfig();
    }
  });

  return (
    <div class="flex h-full flex-col animate-fade-in">
      {/* Header */}
      <div class="flex items-center gap-3 border-b border-[var(--border)] px-6 py-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          class="rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
          aria-label="Go back"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 class="text-sm font-semibold text-[var(--text-primary)]">
          Settings
        </h1>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-y-auto">
        <div class="mx-auto max-w-2xl space-y-8 px-6 py-8">
          {/* Providers section */}
          <section>
            <h2 class="mb-4 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Providers
            </h2>
            <div class="space-y-4">
              <ProviderList />
              <div class="rounded-lg border border-[var(--border)] p-4">
                <h3 class="mb-3 text-sm font-medium text-[var(--text-primary)]">
                  Add Provider
                </h3>
                <ProviderForm />
              </div>
            </div>
          </section>

          {/* Defaults section */}
          <section>
            <h2 class="mb-4 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Defaults
            </h2>
            <div class="rounded-lg border border-[var(--border)] p-4">
              <SettingsForm />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

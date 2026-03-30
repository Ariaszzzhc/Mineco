import { useNavigate } from "@solidjs/router";
import { createSignal, onMount, Show } from "solid-js";
import { api } from "../lib/api-client";
import { sessionStore } from "../stores/session";

export function HomePage() {
  const navigate = useNavigate();
  const [error, setError] = createSignal(false);

  async function createAndNavigate() {
    try {
      const session = await api.createSession();
      sessionStore.addSession(session);
      navigate(`/sessions/${session.id}`, { replace: true });
    } catch {
      setError(true);
    }
  }

  onMount(createAndNavigate);

  return (
    <div class="flex h-full items-center justify-center">
      <Show
        when={!error()}
        fallback={
          <div class="text-center">
            <div class="text-sm text-[var(--error)]">Failed to create session</div>
            <button
              type="button"
              onClick={createAndNavigate}
              class="mt-2 text-sm text-[var(--primary)] hover:underline"
            >
              Retry
            </button>
          </div>
        }
      >
        <div class="text-sm text-[var(--text-muted)]">Creating session...</div>
      </Show>
    </div>
  );
}

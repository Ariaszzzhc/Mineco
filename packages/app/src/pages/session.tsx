import { useParams, useNavigate } from "@solidjs/router";
import { onMount, Show } from "solid-js";
import { ChatView } from "../components/chat/chat-view";
import { sessionStore } from "../stores/session";
import { configStore } from "../stores/config";

export function SessionPage() {
  const params = useParams();
  const navigate = useNavigate();

  onMount(async () => {
    const id = params.id;
    if (!id) {
      navigate("/", { replace: true });
      return;
    }

    await Promise.all([
      sessionStore.selectSession(id),
      configStore.config() ? Promise.resolve() : configStore.loadConfig(),
    ]);

    // If session not found, go home
    if (!sessionStore.currentSession()) {
      navigate("/", { replace: true });
    }
  });

  return (
    <Show
      when={sessionStore.currentSession()}
      fallback={
        <div class="flex h-full items-center justify-center">
          <div class="text-sm text-[var(--text-muted)]">Loading...</div>
        </div>
      }
    >
      <ChatView />
    </Show>
  );
}

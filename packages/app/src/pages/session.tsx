import { useNavigate, useParams } from "@solidjs/router";
import { createEffect, on, Show } from "solid-js";
import { useI18n } from "../i18n/index.tsx";
import { ChatView } from "../components/chat/chat-view";
import { chatStore } from "../stores/chat";
import { configStore } from "../stores/config";
import { sessionStore } from "../stores/session";

export function SessionPage() {
  const params = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();

  createEffect(
    on(
      () => params.sessionId,
      async (id) => {
        if (!id) {
          navigate("/", { replace: true });
          return;
        }

        chatStore.resetIfSessionChanged(id);

        await Promise.all([
          sessionStore.selectSession(id),
          configStore.config() ? Promise.resolve() : configStore.loadConfig(),
        ]);

        // If session not found, go back to workspace
        if (!sessionStore.currentSession()) {
          const workspaceId = params.workspaceId;
          if (workspaceId) {
            navigate(`/workspaces/${workspaceId}`, { replace: true });
          } else {
            navigate("/", { replace: true });
          }
        }
      },
    ),
  );

  return (
    <Show
      when={sessionStore.currentSession()}
      fallback={
        <div class="flex h-full items-center justify-center">
          <div class="text-sm text-[var(--text-muted)]">{t("common.loading")}</div>
        </div>
      }
    >
      <ChatView />
    </Show>
  );
}

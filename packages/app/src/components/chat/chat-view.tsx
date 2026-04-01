import { Show } from "solid-js";
import { chatStore } from "../../stores/chat";
import { configStore } from "../../stores/config";
import { sessionStore } from "../../stores/session";
import { ChatInput } from "./chat-input";
import { HeroPrompt } from "./hero-prompt";
import { MessageList } from "./message-list";
import { SubagentView } from "./subagent-view";

export function ChatView() {
  const session = () => sessionStore.currentSession();
  const messages = () => session()?.messages ?? [];
  const hasNoProvider = () => {
    const config = configStore.config();
    return !config || config.providers.length === 0;
  };
  const activeSubagentRunId = () => chatStore.activeSubagentRunId();
  const activeSubagentRun = () => {
    const runId = activeSubagentRunId();
    if (!runId) return null;
    return chatStore.subagentRuns()[runId] ?? null;
  };

  function handleSend(message: string) {
    const s = session();
    if (!s) return;
    chatStore.startStream(s.id, message);
  }

  return (
    <div class="flex h-full flex-col">
      <Show
        when={activeSubagentRun()}
        fallback={
          <>
            <Show when={messages().length === 0 && !chatStore.isStreaming()}>
              <HeroPrompt />
            </Show>
            <Show when={messages().length > 0 || chatStore.isStreaming()}>
              <MessageList messages={messages()} />
            </Show>

            <Show when={chatStore.error()}>
              <div class="mx-auto max-w-3xl px-4 pb-2">
                <div class="rounded-lg border border-[var(--error)] bg-red-50 px-3 py-2 text-xs text-[var(--error)]">
                  {chatStore.error()}
                </div>
              </div>
            </Show>

            <ChatInput
              onSend={handleSend}
              onStop={() => chatStore.stopStream()}
              isStreaming={chatStore.isStreaming()}
              disabled={hasNoProvider()}
            />
          </>
        }
      >
        {(run) => (
          <SubagentView
            run={run()}
            onBack={() => chatStore.exitSubagentView()}
          />
        )}
      </Show>
    </div>
  );
}

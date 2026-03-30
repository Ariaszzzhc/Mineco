import { Show } from "solid-js";
import { ChatInput } from "./chat-input";
import { MessageList } from "./message-list";
import { HeroPrompt } from "./hero-prompt";
import { chatStore } from "../../stores/chat";
import { sessionStore } from "../../stores/session";
import { configStore } from "../../stores/config";

export function ChatView() {
  const session = () => sessionStore.currentSession();
  const messages = () => session()?.messages ?? [];
  const hasNoProvider = () => {
    const config = configStore.config();
    return !config || config.providers.length === 0;
  };

  function handleSend(message: string) {
    const s = session();
    if (!s) return;
    chatStore.startStream(s.id, message);
  }

  return (
    <div class="flex h-full flex-col">
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
    </div>
  );
}

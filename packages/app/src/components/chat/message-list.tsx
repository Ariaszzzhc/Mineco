import { createEffect, For, on, Show } from "solid-js";
import { renderMarkdown } from "../../lib/markdown";
import type { SessionMessage } from "../../lib/types";
import { chatStore } from "../../stores/chat";
import { MessageItem } from "./message-item";
import { ThinkingBlock } from "./thinking-block";
import { ToolCard } from "./tool-card";

interface MessageListProps {
  messages: SessionMessage[];
}

export function MessageList(props: MessageListProps) {
  let scrollRef!: HTMLDivElement;

  const streamingTools = () => {
    const calls = chatStore.streamingToolCalls();
    const results = chatStore.streamingToolResults();
    return calls.map((call) => ({
      call,
      result: results.find((r) => r.toolCallId === call.toolCallId),
    }));
  };

  createEffect(
    on(
      () => [
        props.messages.length,
        chatStore.streamingThinking(),
        chatStore.streamingText(),
        chatStore.streamingToolCalls().length,
      ],
      () => {
        requestAnimationFrame(() => {
          if (scrollRef) {
            scrollRef.scrollTop = scrollRef.scrollHeight;
          }
        });
      },
    ),
  );

  return (
    <div ref={scrollRef} class="flex-1 overflow-y-auto px-4 py-6">
      <div class="mx-auto max-w-3xl">
        <For each={props.messages}>
          {(msg) => <MessageItem message={msg} />}
        </For>

        <Show
          when={
            chatStore.streamingThinking() ||
            chatStore.streamingText() ||
            chatStore.streamingToolCalls().length > 0
          }
        >
          <div class="border-l-2 border-[var(--primary)] py-3 pl-4">
            <Show when={chatStore.streamingThinking()}>
              <ThinkingBlock
                text={chatStore.streamingThinking()}
                isStreaming={true}
              />
            </Show>
            <Show when={chatStore.streamingText()}>
              <div
                class="prose max-w-none text-sm text-[var(--text-primary)]"
                innerHTML={renderMarkdown(chatStore.streamingText())}
              />
            </Show>
            <For each={streamingTools()}>
              {(item) => <ToolCard call={item.call} result={item.result} />}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}

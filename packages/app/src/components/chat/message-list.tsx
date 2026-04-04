import { createEffect, For, on, Show } from "solid-js";
import { renderMarkdown } from "../../lib/markdown";
import type { SessionMessage } from "../../lib/types";
import { chatStore, type StreamingSegment } from "../../stores/chat";
import { MessageItem } from "./message-item";
import { SubagentCard } from "./subagent-card";
import { ThinkingBlock } from "./thinking-block";
import { ToolCard } from "./tool-card";

interface MessageListProps {
  messages: SessionMessage[];
  sessionId: string;
}

function StreamingSegmentView(props: {
  segment: StreamingSegment;
  isStreaming: boolean;
}) {
  const tools = () => {
    const calls = props.segment.toolCalls;
    const results = props.segment.toolResults;
    return calls.map((call) => ({
      call,
      result: results.find((r) => r.toolCallId === call.toolCallId),
    }));
  };

  return (
    <>
      {/* Assistant content (thinking + text) with blue border, matching MessageItem role=assistant */}
      <Show when={props.segment.thinking || props.segment.text}>
        <div class="space-y-2 border-l-2 border-[var(--primary)] py-3 pl-4">
          <Show when={props.segment.thinking}>
            <ThinkingBlock
              text={props.segment.thinking}
              isStreaming={props.isStreaming}
            />
          </Show>
          <Show when={props.segment.text}>
            <div
              class="prose max-w-none text-sm text-[var(--text-primary)]"
              innerHTML={renderMarkdown(props.segment.text)}
            />
          </Show>
        </div>
      </Show>
      {/* Tool cards without border, matching MessageItem role=tool */}
      <For each={tools()}>
        {(item) => {
          const isAgent = () => item.call.toolName === "agent";
          const subagentRun = () => {
            if (!isAgent()) return null;
            const args = item.call.args as { agent_type?: string };
            // Find the subagent run that matches this tool call
            return null; // Will be handled by parent with sessionId context
          };

          return (
            <div class="py-3">
              <ToolCard call={item.call} result={item.result} />
            </div>
          );
        }}
      </For>
    </>
  );
}

export function MessageList(props: MessageListProps) {
  let scrollRef!: HTMLDivElement;

  const sid = () => props.sessionId;

  const currentSegment = (): StreamingSegment | null => {
    const text = chatStore.streamingText(sid());
    const thinking = chatStore.streamingThinking(sid());
    const calls = chatStore.streamingToolCalls(sid());
    const results = chatStore.streamingToolResults(sid());
    if (!text && !thinking && calls.length === 0) return null;
    return { text, thinking, toolCalls: calls, toolResults: results };
  };

  createEffect(
    on(
      () => [
        props.messages.length,
        chatStore.streamingThinking(sid()),
        chatStore.streamingText(sid()),
        chatStore.streamingToolCalls(sid()).length,
        chatStore.streamingMessages(sid()).length,
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

        {/* Optimistic user message shown during streaming */}
        <Show when={chatStore.pendingUserMessage(sid())}>
          <div class="py-3">
            <div class="rounded-xl bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--text-primary)]">
              {chatStore.pendingUserMessage(sid())}
            </div>
          </div>
        </Show>

        {/* Completed streaming segments */}
        <For each={chatStore.streamingMessages(sid())}>
          {(seg) => <StreamingSegmentView segment={seg} isStreaming={false} />}
        </For>

        {/* Current streaming segment */}
        <Show when={currentSegment()}>
          {(seg) => <StreamingSegmentView segment={seg()} isStreaming={true} />}
        </Show>
      </div>
    </div>
  );
}

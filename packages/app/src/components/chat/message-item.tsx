import { Show } from "solid-js";
import type { SessionMessage } from "../../lib/types";
import { renderMarkdown } from "../../lib/markdown";
import { ToolCard } from "./tool-card";

interface MessageItemProps {
  message: SessionMessage;
  streamingCalls?: Array<{ call?: import("../../lib/types").ToolCallEvent; result?: import("../../lib/types").ToolResultEvent }>;
}

export function MessageItem(props: MessageItemProps) {
  return (
    <div
      class="py-3"
      classList={{
        "pl-4 border-l-2 border-[var(--primary)]": props.message.role === "assistant",
      }}
    >
      <Show when={props.message.role === "user"}>
        <div class="rounded-xl bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--text-primary)]">
          {props.message.content}
        </div>
      </Show>

      <Show when={props.message.role === "assistant"}>
        <div
          class="prose max-w-none text-sm text-[var(--text-primary)]"
          innerHTML={renderMarkdown(props.message.content)}
        />
      </Show>

      <Show when={props.message.role === "tool"}>
        <ToolCard
          call={
            props.streamingCalls?.find(
              (c) => c.call?.toolCallId === props.message.toolCallId,
            )?.call
          }
          result={
            props.message.toolName
              ? {
                  type: "tool-result" as const,
                  toolCallId: props.message.toolCallId ?? "",
                  toolName: props.message.toolName,
                  result: props.message.content,
                  isError: props.message.isError ?? false,
                }
              : undefined
          }
        />
      </Show>
    </div>
  );
}

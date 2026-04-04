import { Show } from "solid-js";
import { renderMarkdown } from "../../lib/markdown";
import type { SessionMessage } from "../../lib/types";
import { chatStore } from "../../stores/chat";
import { SubagentCard } from "./subagent-card";
import { ThinkingBlock } from "./thinking-block";
import { ToolCard } from "./tool-card";

interface MessageItemProps {
  message: SessionMessage;
  sessionId: string;
  streamingCalls?: Array<{
    call?: import("../../lib/types").ToolCallEvent;
    result?: import("../../lib/types").ToolResultEvent;
  }>;
}

export function MessageItem(props: MessageItemProps) {
  return (
    <div
      class="py-3"
      classList={{
        "pl-4 border-l-2 border-[var(--primary)]":
          props.message.role === "assistant",
      }}
    >
      <Show when={props.message.role === "user"}>
        <div class="rounded-xl bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--text-primary)]">
          {props.message.content}
        </div>
      </Show>

      <Show when={props.message.role === "assistant"}>
        <Show when={props.message.thinking}>
          <ThinkingBlock text={props.message.thinking!} />
        </Show>
        <div
          class="prose max-w-none text-sm text-[var(--text-primary)]"
          innerHTML={renderMarkdown(props.message.content)}
        />
      </Show>

      <Show when={props.message.role === "tool"}>
        <Show
          when={props.message.toolName === "agent"}
          fallback={
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
          }
        >
          {(() => {
            // For persisted agent tool messages, find the matching subagent run
            const runs = chatStore.subagentRuns(props.sessionId);
            const matchingRun = Object.values(runs).find(
              (r) => r.agentType === props.message.content,
            );
            if (matchingRun) {
              return (
                <SubagentCard
                  run={matchingRun}
                  onClick={() => chatStore.viewSubagent(props.sessionId, matchingRun.runId)}
                />
              );
            }
            // Fallback: show as regular tool card if no run found
            return (
              <ToolCard
                call={
                  props.streamingCalls?.find(
                    (c) => c.call?.toolCallId === props.message.toolCallId,
                  )?.call
                }
                result={{
                  type: "tool-result" as const,
                  toolCallId: props.message.toolCallId ?? "",
                  toolName: props.message.toolName ?? "agent",
                  result: props.message.content,
                  isError: props.message.isError ?? false,
                }}
              />
            );
          })()}
        </Show>
      </Show>
    </div>
  );
}

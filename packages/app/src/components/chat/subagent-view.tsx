import { ArrowLeft } from "lucide-solid";
import { For, Show } from "solid-js";
import { renderMarkdown } from "../../lib/markdown";
import type { StreamingSegment, SubagentRunState } from "../../stores/chat";
import { ThinkingBlock } from "./thinking-block";
import { ToolCard } from "./tool-card";

interface SubagentViewProps {
  run: SubagentRunState;
  onBack: () => void;
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
      <For each={tools()}>
        {(item) => (
          <div class="py-3">
            <ToolCard call={item.call} result={item.result} />
          </div>
        )}
      </For>
    </>
  );
}

export function SubagentView(props: SubagentViewProps) {
  const isRunning = () => props.run.status === "running";

  const currentSegment = () => {
    const {
      streamingText,
      streamingThinking,
      streamingToolCalls,
      streamingToolResults,
    } = props.run;
    if (!streamingText && !streamingThinking && streamingToolCalls.length === 0)
      return null;
    return {
      text: streamingText,
      thinking: streamingThinking,
      toolCalls: streamingToolCalls,
      toolResults: streamingToolResults,
    };
  };

  return (
    <div class="flex h-full flex-col">
      {/* Breadcrumb */}
      <div class="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2">
        <button
          type="button"
          onClick={props.onBack}
          class="flex items-center gap-1 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={14} />
          返回主对话
        </button>
        <span class="text-xs text-[var(--text-muted)]">/</span>
        <span class="text-xs font-medium text-[var(--text-secondary)]">
          {props.run.agentType}
        </span>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-y-auto px-4 py-6">
        <div class="mx-auto max-w-3xl">
          {/* User prompt shown as synthetic first message */}
          <Show when={props.run.summary === null && isRunning()}>
            <div class="py-3">
              <div class="rounded-xl bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--text-primary)] italic text-[var(--text-muted)]">
                Subagent is running...
              </div>
            </div>
          </Show>

          {/* Completed segments */}
          <For each={props.run.streamingSegments}>
            {(seg) => (
              <StreamingSegmentView segment={seg} isStreaming={false} />
            )}
          </For>

          {/* Current streaming segment */}
          <Show when={currentSegment()}>
            {(seg) => (
              <StreamingSegmentView segment={seg()} isStreaming={isRunning()} />
            )}
          </Show>
        </div>
      </div>

      {/* Read-only footer */}
      <div class="border-t border-[var(--border)] px-4 py-3 text-center text-xs text-[var(--text-muted)]">
        查看子 Agent 运行详情 · 点击上方返回主对话
      </div>
    </div>
  );
}

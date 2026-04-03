import { createEffect, createSignal, on, Show } from "solid-js";
import { api } from "../../lib/api-client";
import { chatStore } from "../../stores/chat";
import { configStore } from "../../stores/config";
import { sessionStore } from "../../stores/session";
import { ChatInput } from "./chat-input";
import { ActiveSkillBadge } from "./active-skill-badge";
import { HeroPrompt } from "./hero-prompt";
import { MessageList } from "./message-list";
import { SubagentView } from "./subagent-view";

function formatUsageTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function formatUsageCost(n: number): string {
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

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

  const [activeSkillName, setActiveSkillName] = createSignal<string | null>(null);

  const [sessionUsage, setSessionUsage] = createSignal<{
    totalTokens: number;
    totalCost: number;
    totalRequests: number;
  } | null>(null);

  // Fetch session usage when session changes
  createEffect(
    on(session, async (s) => {
      if (!s) {
        setSessionUsage(null);
        return;
      }
      const id = s.id;
      try {
        const stats = await api.getSessionStats(id);
        if (session()?.id !== id) return;
        setSessionUsage(stats);
      } catch {
        if (session()?.id !== id) return;
        setSessionUsage(null);
      }
    }),
  );

  // Refresh usage after streaming completes
  createEffect(
    on(
      () => chatStore.isStreaming(),
      async (streaming, prev) => {
        const s = session();
        if (prev === true && streaming === false && s) {
          const id = s.id;
          try {
            const stats = await api.getSessionStats(id);
            if (session()?.id !== id) return;
            setSessionUsage(stats);
          } catch {
            /* ignore */
          }
        }
      },
    ),
  );

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

            <Show when={sessionUsage()}>
              {(usage) => (
                <div class="mx-auto max-w-3xl px-4 pb-1">
                  <div class="flex items-center justify-center gap-3 text-[11px] text-[var(--text-muted)]">
                    <span>
                      Tokens: {formatUsageTokens(usage().totalTokens)}
                    </span>
                    <span class="text-[var(--border)]">|</span>
                    <span>Cost: {formatUsageCost(usage().totalCost)}</span>
                  </div>
                </div>
              )}
            </Show>

            <Show when={activeSkillName()}>
              {(name) => (
                <ActiveSkillBadge
                  skillName={name()}
                  onDismiss={() => setActiveSkillName(null)}
                />
              )}
            </Show>

            <ChatInput
              onSend={handleSend}
              onStop={() => chatStore.stopStream()}
              isStreaming={chatStore.isStreaming()}
              disabled={hasNoProvider()}
              onSkillActivate={(name) => setActiveSkillName(name)}
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

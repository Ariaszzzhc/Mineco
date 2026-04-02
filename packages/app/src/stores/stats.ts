import { createStore } from "solid-js/store";
import { api } from "../lib/api-client";

interface SummaryStats {
  totalTokens: number;
  totalCost: number;
  totalRequests: number;
  byProvider: Record<
    string,
    { totalTokens: number; totalCost: number; requests: number }
  >;
  byModel: Array<{
    providerId: string;
    model: string;
    requests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
  }>;
}

interface DailyStats {
  date: string;
  providerId: string;
  model: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
}

interface ModelStats {
  providerId: string;
  model: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
}

interface StatsState {
  summary: SummaryStats | null;
  daily: DailyStats[];
  byModel: ModelStats[];
  loading: boolean;
  error: string | null;
  dateRange: "today" | "7d" | "30d" | "all";
}

const [state, setState] = createStore<StatsState>({
  summary: null,
  daily: [],
  byModel: [],
  loading: false,
  error: null,
  dateRange: "7d",
});

function computeDateRange(
  range: StatsState["dateRange"],
): { from: string; to: string } | null {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  switch (range) {
    case "today":
      return { from: to, to };
    case "7d":
      return {
        from: new Date(now.getTime() - 7 * 86_400_000)
          .toISOString()
          .slice(0, 10),
        to,
      };
    case "30d":
      return {
        from: new Date(now.getTime() - 30 * 86_400_000)
          .toISOString()
          .slice(0, 10),
        to,
      };
    case "all":
      return null;
  }
}

async function loadSummary(): Promise<void> {
  const data = await api.getStatsSummary();
  setState("summary", data);
}

async function loadDaily(from?: string, to?: string): Promise<void> {
  if (!from || !to) {
    setState("daily", []);
    return;
  }
  const data = await api.getStatsDaily(from, to);
  setState("daily", data);
}

async function loadByModel(from?: string, to?: string): Promise<void> {
  const data = await api.getStatsByModel(from, to);
  setState("byModel", data);
}

async function loadAll(from?: string, to?: string): Promise<void> {
  setState("loading", true);
  setState("error", null);
  try {
    await Promise.all([
      loadSummary(),
      loadDaily(from, to),
      loadByModel(from, to),
    ]);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load stats";
    setState("error", message);
    throw e;
  } finally {
    setState("loading", false);
  }
}

async function setDateRange(range: StatsState["dateRange"]): Promise<void> {
  setState("dateRange", range);
  const dates = computeDateRange(range);
  await loadAll(dates?.from, dates?.to);
}

async function getSessionUsage(sessionId: string) {
  return api.getSessionStats(sessionId);
}

export const statsStore = {
  summary: () => state.summary,
  daily: () => state.daily,
  byModel: () => state.byModel,
  loading: () => state.loading,
  error: () => state.error,
  dateRange: () => state.dateRange,
  loadSummary,
  loadDaily,
  loadByModel,
  loadAll,
  setDateRange,
  getSessionUsage,
};

export type { DailyStats, ModelStats, SummaryStats };

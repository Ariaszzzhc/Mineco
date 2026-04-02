import { createStore } from "solid-js/store";
import { api } from "../lib/api-client";

interface QuotaUsage {
  label: string;
  used: number;
  limit: number;
  percentage: number;
  window: string;
  resetAt: number | null;
}

interface SubscriptionInfo {
  planName: string;
  quotas: QuotaUsage[];
  expiresAt: number | null;
}

interface SubscriptionState {
  info: SubscriptionInfo | null;
  loading: boolean;
  error: string | null;
}

const [state, setState] = createStore<SubscriptionState>({
  info: null,
  loading: false,
  error: null,
});

let refreshTimer: ReturnType<typeof setInterval> | null = null;

async function fetchSubscriptionInfo() {
  setState({ loading: true, error: null });
  try {
    const info = await api.getSubscription();
    setState({ info, loading: false });
  } catch (err) {
    setState({
      error: err instanceof Error ? err.message : "Failed to fetch subscription",
      loading: false,
    });
  }
}

function startAutoRefresh() {
  if (refreshTimer) return;
  void fetchSubscriptionInfo();
  refreshTimer = setInterval(() => void fetchSubscriptionInfo(), 5 * 60 * 1000);
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

export const subscriptionStore = {
  info: () => state.info,
  loading: () => state.loading,
  error: () => state.error,
  fetchSubscriptionInfo,
  startAutoRefresh,
  stopAutoRefresh,
};

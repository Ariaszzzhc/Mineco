import type { QuotaUsage, SubscriptionClient, SubscriptionInfo, UsageSummary } from "./subscription.js";

// MiniMax API response types (internal)

interface MiniMaxBaseResp {
  status_code: number;
  status_msg: string;
}

interface MiniMaxModelRemains {
  model_name: string;
  current_interval_total_count: number;
  /** Remaining count (NOT used count) */
  current_interval_usage_count: number;
  end_time: number | null;
  current_weekly_total_count: number;
  current_weekly_usage_count: number;
  weekly_end_time: number | null;
}

interface MiniMaxRemainsResponse {
  base_resp: MiniMaxBaseResp | null;
  model_remains: MiniMaxModelRemains[];
}

export class MiniMaxSubscriptionClient implements SubscriptionClient {
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly cookie: string | undefined;

  constructor(apiKey: string, baseURL: string, cookie?: string) {
    this.apiKey = apiKey;
    this.baseURL = baseURL;
    this.cookie = cookie;
  }

  async getSubscriptionInfo(): Promise<SubscriptionInfo> {
    const url = `${this.baseURL}/v1/api/openplatform/coding_plan/remains`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (this.cookie) {
      headers.Cookie = this.cookie;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`Failed to fetch MiniMax subscription: ${response.status}`);
    }

    const body = (await response.json()) as MiniMaxRemainsResponse;

    // Filter for text models (model_name starts with "MiniMax-M")
    const model = body.model_remains.find((m) =>
      m.model_name.startsWith("MiniMax-M"),
    );

    if (!model) {
      return {
        planName: "Token Plan",
        quotas: [],
        primaryPercentage: 0,
        expiresAt: null,
      };
    }

    const quotas: QuotaUsage[] = [];

    // Interval quota (5h window)
    const intervalTotal = model.current_interval_total_count;
    const intervalRemaining = model.current_interval_usage_count;
    const intervalUsed = intervalTotal - intervalRemaining;
    const intervalPct =
      intervalTotal > 0
        ? Math.round((intervalUsed / intervalTotal) * 100)
        : 0;

    quotas.push({
      label: "请求配额",
      used: intervalUsed,
      limit: intervalTotal,
      percentage: intervalPct,
      window: "5h",
      resetAt: model.end_time ? Math.floor(model.end_time / 1000) : null,
    });

    // Weekly quota (only if weekly_total > 0 — old plans have 0)
    if (model.current_weekly_total_count > 0) {
      const weeklyTotal = model.current_weekly_total_count;
      const weeklyRemaining = model.current_weekly_usage_count;
      const weeklyUsed = weeklyTotal - weeklyRemaining;
      const weeklyPct =
        weeklyTotal > 0
          ? Math.round((weeklyUsed / weeklyTotal) * 100)
          : 0;

      quotas.push({
        label: "每周配额",
        used: weeklyUsed,
        limit: weeklyTotal,
        percentage: weeklyPct,
        window: "weekly",
        resetAt: model.weekly_end_time
          ? Math.floor(model.weekly_end_time / 1000)
          : null,
      });
    }

    return {
      planName: "Token Plan",
      quotas,
      primaryPercentage: intervalPct,
      expiresAt: null,
    };
  }

  async getUsage(_startTime: number, _endTime: number): Promise<UsageSummary> {
    // MiniMax doesn't expose a usage history endpoint via token plan API
    return { callCount: 0, totalTokens: 0 };
  }
}

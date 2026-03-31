import type {
  QuotaUsage,
  SubscriptionClient,
  SubscriptionInfo,
  UsageSummary,
} from "./subscription.js";

// Zhipu-specific API response types (internal)

interface QuotaLimitResponse {
  code: number;
  msg: string;
  data: Array<{
    quota_type: string;
    unit: number;
    usage: number;
    current_value: number;
    percentage: number;
    next_reset_time: number | null;
  }>;
  success: boolean;
}

interface ModelUsageResponse {
  code: number;
  msg: string;
  data: {
    modelTotalUsage: {
      total_model_call_count: number;
      total_tokens_usage: number;
    };
  } | null;
  success: boolean;
}

// Zhipu quota unit → label/window mapping

const QUOTA_LABELS: Record<number, { label: string; window: string }> = {
  3: { label: "Token 配额", window: "5h" },
  5: { label: "MCP 配额", window: "30d" },
  6: { label: "每周配额", window: "weekly" },
};

// Zhipu unit → plan name mapping (highest wins)
const PLAN_NAMES: Record<number, string> = {
  5: "Pro",
  6: "Max",
};

function parseQuotaItem(
  item: QuotaLimitResponse["data"][number],
): QuotaUsage & { unit: number } {
  const meta = QUOTA_LABELS[item.unit] ?? {
    label: "配额",
    window: "unknown",
  };
  const isTimeLimit = item.quota_type === "TIME_LIMIT";

  return {
    label: meta.label,
    used: isTimeLimit ? item.current_value : item.percentage,
    limit: isTimeLimit ? item.usage : 100,
    percentage: item.percentage,
    window: meta.window,
    resetAt: item.next_reset_time
      ? Math.floor(item.next_reset_time / 1000)
      : null,
    unit: item.unit,
  };
}

export class ZhipuSubscriptionClient implements SubscriptionClient {
  private readonly apiKey: string;
  private readonly baseURL: string;

  constructor(apiKey: string, baseURL: string) {
    this.apiKey = apiKey;
    this.baseURL = baseURL;
  }

  async getSubscriptionInfo(): Promise<SubscriptionInfo> {
    const response = await fetch(`${this.baseURL}/monitor/usage/quota/limit`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch subscription info: ${response.status}`);
    }

    const body = (await response.json()) as QuotaLimitResponse;
    if (!body.success) {
      throw new Error(`API error: ${body.msg}`);
    }

    let planName = "Lite";
    const quotas: QuotaUsage[] = [];

    for (const item of body.data) {
      const quota = parseQuotaItem(item);

      // Detect plan level (higher unit wins)
      const plan = PLAN_NAMES[item.unit];
      if (plan) {
        // Max (unit 6) beats Pro (unit 5)
        if (plan === "Max" || planName === "Lite") {
          planName = plan;
        }
      }

      // Add quota without internal unit field
      const { unit: _, ...quotaWithoutUnit } = quota;
      quotas.push(quotaWithoutUnit);
    }

    return { planName, quotas, expiresAt: null };
  }

  async getUsage(startTime: number, endTime: number): Promise<UsageSummary> {
    const params = new URLSearchParams({
      startTime: startTime.toString(),
      endTime: endTime.toString(),
    });

    const response = await fetch(
      `${this.baseURL}/monitor/usage/model-usage?${params}`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch model usage: ${response.status}`);
    }

    const body = (await response.json()) as ModelUsageResponse;
    if (!body.success || !body.data) {
      return { callCount: 0, totalTokens: 0 };
    }

    return {
      callCount: body.data.modelTotalUsage.total_model_call_count,
      totalTokens: body.data.modelTotalUsage.total_tokens_usage,
    };
  }
}

import type {
  QuotaUsage,
  SubscriptionClient,
  SubscriptionInfo,
} from "./subscription.js";

// Zhipu-specific API response types (internal)

interface QuotaLimitItem {
  type: string;
  unit: number;
  number: number;
  usage?: number;
  currentValue?: number;
  remaining?: number;
  percentage: number;
  nextResetTime: number | null;
}

interface QuotaLimitResponse {
  code: number;
  msg: string;
  data: {
    limits: QuotaLimitItem[];
    level?: string;
  };
  success: boolean;
}

// Zhipu quota unit → label/window mapping
// unit 3 = Token 配额 (5h window)
// unit 5 = MCP 配额 (30d window)
const QUOTA_META: Record<number, { label: string; window: string }> = {
  3: { label: "Token 配额", window: "5h" },
  5: { label: "MCP 配额", window: "30d" },
  6: { label: "每周配额", window: "weekly" },
};

function parseQuotaItem(item: QuotaLimitItem): QuotaUsage {
  const meta = QUOTA_META[item.unit] ?? {
    label: "配额",
    window: "unknown",
  };
  const isTokenLimit = item.type === "TOKENS_LIMIT";

  return {
    label: meta.label,
    used: isTokenLimit ? item.percentage : (item.currentValue ?? 0),
    limit: isTokenLimit ? 100 : (item.usage ?? 0),
    percentage: item.percentage,
    window: meta.window,
    resetAt: item.nextResetTime ? Math.floor(item.nextResetTime / 1000) : null,
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

    const rawLevel = body.data.level ?? "lite";
    const planName = rawLevel.charAt(0).toUpperCase() + rawLevel.slice(1);

    const quotas = body.data.limits.map(parseQuotaItem);

    // Primary indicator: Token quota (TOKENS_LIMIT, unit 3)
    const tokenLimit = body.data.limits.find(
      (l) => l.type === "TOKENS_LIMIT" && l.unit === 3,
    );

    return {
      planName,
      quotas,
      primaryPercentage: tokenLimit?.percentage ?? 0,
      expiresAt: null,
    };
  }

}

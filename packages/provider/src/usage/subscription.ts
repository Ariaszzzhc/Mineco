/** Generic quota usage info */
export interface QuotaUsage {
  /** Human-readable label, e.g. "5小时Token配额" */
  label: string;
  /** Used amount */
  used: number;
  /** Total limit */
  limit: number;
  /** Usage percentage 0-100 */
  percentage: number;
  /** Time window label, e.g. "5h", "weekly", "30d" */
  window: string;
  /** Reset timestamp in seconds, null if not applicable */
  resetAt: number | null;
}

/** Generic subscription info */
export interface SubscriptionInfo {
  /** Display name of current plan, e.g. "Max", "Pro" */
  planName: string;
  /** Active quotas */
  quotas: QuotaUsage[];
  /** Primary usage percentage 0-100 for statusline display */
  primaryPercentage: number;
  /** Subscription expiry timestamp in seconds, null if not applicable */
  expiresAt: number | null;
}

/** Interface for querying subscription info from a provider */
export interface SubscriptionClient {
  getSubscriptionInfo(): Promise<SubscriptionInfo>;
}

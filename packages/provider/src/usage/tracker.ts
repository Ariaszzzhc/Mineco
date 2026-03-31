import type { Usage } from "../types.js";

export interface UsageFilter {
  providerId?: string;
  model?: string;
}

export interface ModelUsageStats {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
}

export interface ProviderUsageStats {
  totalTokens: number;
  totalCost: number;
  byModel: Record<string, ModelUsageStats>;
}

export interface UsageStats {
  totalTokens: number;
  totalCost: number;
  byProvider: Record<string, ProviderUsageStats>;
}

interface UsageRecord {
  providerId: string;
  model: string;
  usage: Usage;
  cost: number;
}

export class UsageTracker {
  private readonly records: UsageRecord[] = [];

  record(providerId: string, model: string, usage: Usage, cost = 0): void {
    this.records.push({ providerId, model, usage, cost });
  }

  getStats(filter?: UsageFilter): UsageStats {
    const stats: UsageStats = {
      totalTokens: 0,
      totalCost: 0,
      byProvider: {},
    };

    for (const record of this.records) {
      if (filter?.providerId && record.providerId !== filter.providerId) {
        continue;
      }
      if (filter?.model && record.model !== filter.model) {
        continue;
      }

      stats.totalTokens += record.usage.totalTokens;
      stats.totalCost += record.cost;

      let provider = stats.byProvider[record.providerId];
      if (!provider) {
        provider = { totalTokens: 0, totalCost: 0, byModel: {} };
        stats.byProvider[record.providerId] = provider;
      }

      provider.totalTokens += record.usage.totalTokens;
      provider.totalCost += record.cost;

      let model = provider.byModel[record.model];
      if (!model) {
        model = {
          requests: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cost: 0,
        };
        provider.byModel[record.model] = model;
      }

      model.requests += 1;
      model.promptTokens += record.usage.promptTokens;
      model.completionTokens += record.usage.completionTokens;
      model.totalTokens += record.usage.totalTokens;
      model.cost += record.cost;
    }

    return stats;
  }

  reset(): void {
    this.records.length = 0;
  }
}

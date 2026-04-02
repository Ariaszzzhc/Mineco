import { randomUUID } from "node:crypto";
import type { PricingDB, Usage } from "@mineco/provider";
import { type Kysely, sql } from "kysely";
import type { Database } from "./schema.js";

export interface UsageRecordInput {
  providerId: string;
  model: string;
  sessionId?: string;
  messageId?: string;
  usage: Usage;
}

export interface GlobalStats {
  totalTokens: number;
  totalCost: number;
  totalRequests: number;
  byProvider: Record<
    string,
    { totalTokens: number; totalCost: number; requests: number }
  >;
}

export interface DailyStats {
  date: string;
  providerId: string;
  model: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
}

export interface ModelStats {
  providerId: string;
  model: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
}

export interface SessionStats {
  sessionId: string;
  totalTokens: number;
  totalCost: number;
  totalRequests: number;
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

export class SqliteUsageStore {
  constructor(
    private db: Kysely<Database>,
    private pricingDB: PricingDB,
  ) {}

  async record(input: UsageRecordInput): Promise<void> {
    const price = this.pricingDB.getPrice(input.providerId, input.model);
    let cost = 0;
    if (price) {
      const inputCost =
        (input.usage.promptTokens / 1_000_000) * price.inputPerMillion;
      const outputCost =
        (input.usage.completionTokens / 1_000_000) * price.outputPerMillion;
      cost = inputCost + outputCost;
    }

    const id = randomUUID();
    const now = Date.now();
    const date = new Date(now).toISOString().slice(0, 10) ?? "";

    await this.db
      .insertInto("usage_records")
      .values({
        id,
        provider_id: input.providerId,
        model: input.model,
        session_id: input.sessionId ?? null,
        message_id: input.messageId ?? null,
        prompt_tokens: input.usage.promptTokens,
        completion_tokens: input.usage.completionTokens,
        total_tokens: input.usage.totalTokens,
        cost,
        created_at: now,
      })
      .execute();

    await sql`INSERT INTO usage_daily (provider_id, model, date, requests, prompt_tokens, completion_tokens, total_tokens, cost)
      VALUES (${input.providerId}, ${input.model}, ${date}, 1, ${input.usage.promptTokens}, ${input.usage.completionTokens}, ${input.usage.totalTokens}, ${cost})
      ON CONFLICT(provider_id, model, date) DO UPDATE SET
        requests = requests + 1,
        prompt_tokens = prompt_tokens + ${input.usage.promptTokens},
        completion_tokens = completion_tokens + ${input.usage.completionTokens},
        total_tokens = total_tokens + ${input.usage.totalTokens},
        cost = cost + ${cost}`.execute(this.db);
  }

  async getSummary(): Promise<GlobalStats> {
    const rows = await this.db
      .selectFrom("usage_daily")
      .select([
        "provider_id",
        sql<number>`SUM(requests)`.as("requests"),
        sql<number>`SUM(prompt_tokens)`.as("prompt_tokens"),
        sql<number>`SUM(completion_tokens)`.as("completion_tokens"),
        sql<number>`SUM(total_tokens)`.as("total_tokens"),
        sql<number>`SUM(cost)`.as("cost"),
      ])
      .groupBy("provider_id")
      .execute();

    const stats: GlobalStats = {
      totalTokens: 0,
      totalCost: 0,
      totalRequests: 0,
      byProvider: {},
    };

    for (const row of rows) {
      const entry = {
        totalTokens: Number(row.total_tokens),
        totalCost: Number(row.cost),
        requests: Number(row.requests),
      };
      stats.byProvider[row.provider_id as string] = entry;
      stats.totalTokens += entry.totalTokens;
      stats.totalCost += entry.totalCost;
      stats.totalRequests += entry.requests;
    }

    return stats;
  }

  async getDaily(from: string, to: string): Promise<DailyStats[]> {
    const rows = await this.db
      .selectFrom("usage_daily")
      .selectAll()
      .where("date", ">=", from)
      .where("date", "<=", to)
      .orderBy("date", "asc")
      .orderBy("provider_id", "asc")
      .orderBy("model", "asc")
      .execute();

    return rows.map((row) => ({
      date: row.date,
      providerId: row.provider_id,
      model: row.model,
      requests: Number(row.requests),
      promptTokens: Number(row.prompt_tokens),
      completionTokens: Number(row.completion_tokens),
      totalTokens: Number(row.total_tokens),
      cost: Number(row.cost),
    }));
  }

  async getByModel(from?: string, to?: string): Promise<ModelStats[]> {
    let query = this.db
      .selectFrom("usage_daily")
      .select([
        "provider_id",
        "model",
        sql<number>`SUM(requests)`.as("requests"),
        sql<number>`SUM(prompt_tokens)`.as("prompt_tokens"),
        sql<number>`SUM(completion_tokens)`.as("completion_tokens"),
        sql<number>`SUM(total_tokens)`.as("total_tokens"),
        sql<number>`SUM(cost)`.as("cost"),
      ])
      .groupBy("provider_id")
      .groupBy("model");

    if (from) query = query.where("date", ">=", from);
    if (to) query = query.where("date", "<=", to);

    const rows = await query
      .orderBy("provider_id", "asc")
      .orderBy("model", "asc")
      .execute();

    return rows.map((row) => ({
      providerId: row.provider_id,
      model: row.model,
      requests: Number(row.requests),
      promptTokens: Number(row.prompt_tokens),
      completionTokens: Number(row.completion_tokens),
      totalTokens: Number(row.total_tokens),
      cost: Number(row.cost),
    }));
  }

  async getSessionUsage(sessionId: string): Promise<SessionStats> {
    const rows = await this.db
      .selectFrom("usage_records")
      .select([
        "provider_id",
        "model",
        sql<number>`COUNT(*)`.as("requests"),
        sql<number>`SUM(prompt_tokens)`.as("prompt_tokens"),
        sql<number>`SUM(completion_tokens)`.as("completion_tokens"),
        sql<number>`SUM(total_tokens)`.as("total_tokens"),
        sql<number>`SUM(cost)`.as("cost"),
      ])
      .where("session_id", "=", sessionId)
      .groupBy("provider_id")
      .groupBy("model")
      .execute();

    const byModel = rows.map((row) => ({
      providerId: row.provider_id as string,
      model: row.model as string,
      requests: Number(row.requests),
      promptTokens: Number(row.prompt_tokens),
      completionTokens: Number(row.completion_tokens),
      totalTokens: Number(row.total_tokens),
      cost: Number(row.cost),
    }));

    const totalTokens = byModel.reduce<number>((sum, m) => sum + m.totalTokens, 0);
    const totalCost = byModel.reduce<number>((sum, m) => sum + m.cost, 0);
    const totalRequests = byModel.reduce<number>((sum, m) => sum + m.requests, 0);

    return { sessionId, totalTokens, totalCost, totalRequests, byModel };
  }
}

import { describe, expect, it } from "vitest";
import { UsageTracker } from "../src/usage/tracker.js";
import { PricingDB } from "../src/usage/pricing.js";
import type { ModelInfo, Usage } from "../src/types.js";

describe("UsageTracker", () => {
  it("should record and aggregate usage", () => {
    const tracker = new UsageTracker();

    tracker.record("zhipu", "glm-5", {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
    tracker.record("zhipu", "glm-5", {
      promptTokens: 200,
      completionTokens: 100,
      totalTokens: 300,
    });
    tracker.record("zhipu", "glm-4.7", {
      promptTokens: 50,
      completionTokens: 25,
      totalTokens: 75,
    });

    const stats = tracker.getStats();
    expect(stats.totalTokens).toBe(525);

    expect(stats.byProvider["zhipu"]!.totalTokens).toBe(525);
    expect(stats.byProvider["zhipu"]!.byModel["glm-5"]!.requests).toBe(2);
    expect(stats.byProvider["zhipu"]!.byModel["glm-5"]!.promptTokens).toBe(300);
    expect(stats.byProvider["zhipu"]!.byModel["glm-4.7"]!.requests).toBe(1);
  });

  it("should filter by provider", () => {
    const tracker = new UsageTracker();

    tracker.record("zhipu", "glm-5", {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
    tracker.record("deepseek", "deepseek-v3", {
      promptTokens: 80,
      completionTokens: 40,
      totalTokens: 120,
    });

    const stats = tracker.getStats({ providerId: "zhipu" });
    expect(stats.totalTokens).toBe(150);
    expect(stats.byProvider["deepseek"]).toBeUndefined();
  });

  it("should filter by model", () => {
    const tracker = new UsageTracker();

    tracker.record("zhipu", "glm-5", {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
    tracker.record("zhipu", "glm-4.7", {
      promptTokens: 80,
      completionTokens: 40,
      totalTokens: 120,
    });

    const stats = tracker.getStats({ model: "glm-5" });
    expect(stats.totalTokens).toBe(150);
  });

  it("should track cost", () => {
    const tracker = new UsageTracker();

    tracker.record(
      "zhipu",
      "glm-5",
      { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      0.05,
    );

    const stats = tracker.getStats();
    expect(stats.totalCost).toBe(0.05);
    expect(stats.byProvider["zhipu"]!.totalCost).toBe(0.05);
    expect(stats.byProvider["zhipu"]!.byModel["glm-5"]!.cost).toBe(0.05);
  });

  it("should reset records", () => {
    const tracker = new UsageTracker();

    tracker.record("zhipu", "glm-5", {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
    tracker.reset();

    const stats = tracker.getStats();
    expect(stats.totalTokens).toBe(0);
    expect(Object.keys(stats.byProvider)).toHaveLength(0);
  });
});

describe("PricingDB", () => {
  it("should store and retrieve custom prices", () => {
    const db = new PricingDB();
    db.setCustomPrice("zhipu", "glm-5", {
      inputPerMillion: 10,
      outputPerMillion: 30,
    });

    expect(db.getPrice("zhipu", "glm-5")).toEqual({
      inputPerMillion: 10,
      outputPerMillion: 30,
    });
  });

  it("should return undefined for unknown prices", () => {
    const db = new PricingDB();
    expect(db.getPrice("zhipu", "glm-5")).toBeUndefined();
  });

  it("should estimate cost", () => {
    const db = new PricingDB();
    const model: ModelInfo = {
      id: "glm-5",
      name: "GLM-5",
      maxOutputTokens: 131072,
      supportsVision: false,
      supportsToolCalling: true,
      supportsStreaming: true,
      pricing: { inputPerMillion: 10, outputPerMillion: 30 },
    };

    const estimate = db.estimateCost(model, 1_000_000, 1_000_000);
    expect(estimate).toEqual({
      inputCost: 10,
      outputCost: 30,
      total: 40,
    });
  });

  it("should return null for model without pricing", () => {
    const db = new PricingDB();
    const model: ModelInfo = {
      id: "glm-5",
      name: "GLM-5",
      maxOutputTokens: 131072,
      supportsVision: false,
      supportsToolCalling: true,
      supportsStreaming: true,
    };

    expect(db.estimateCost(model, 100, 100)).toBeNull();
  });
});

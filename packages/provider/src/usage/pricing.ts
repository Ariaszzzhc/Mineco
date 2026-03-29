import type { ModelInfo, ModelPricing } from "../types.js";

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  total: number;
}

export class PricingDB {
  private readonly customPrices = new Map<string, ModelPricing>();

  getPrice(providerId: string, model: string): ModelPricing | undefined {
    return this.customPrices.get(`${providerId}:${model}`);
  }

  setCustomPrice(
    providerId: string,
    model: string,
    pricing: ModelPricing,
  ): void {
    this.customPrices.set(`${providerId}:${model}`, pricing);
  }

  estimateCost(
    model: ModelInfo,
    inputTokens: number,
    outputTokens: number,
  ): CostEstimate | null {
    if (!model.pricing) return null;

    const inputCost = (inputTokens / 1_000_000) * model.pricing.inputPerMillion;
    const outputCost =
      (outputTokens / 1_000_000) * model.pricing.outputPerMillion;

    return {
      inputCost,
      outputCost,
      total: inputCost + outputCost,
    };
  }
}

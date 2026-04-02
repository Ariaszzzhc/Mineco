import type { ChatRequest, ModelInfo } from "../types.js";
import type { SubscriptionClient } from "../usage/subscription.js";
import { ZhipuSubscriptionClient } from "../usage/zhipu-subscription.js";
import { OpenAICompatAdapter } from "./openai-compat.js";

export type ZhipuPlatform = "cn" | "intl";
export type ZhipuEndpoint = "general" | "coding";

export interface ZhipuConfig {
  apiKey: string;
  /** Domestic ("cn") or international ("intl"). Default: "cn" */
  platform?: ZhipuPlatform;
  /** General API or Coding API endpoint. Default: "general" */
  endpoint?: ZhipuEndpoint;
}

const PLATFORM_URLS: Record<
  ZhipuPlatform,
  { apiBase: string; subscriptionBase: string }
> = {
  cn: {
    apiBase: "https://open.bigmodel.cn/api",
    subscriptionBase: "https://open.bigmodel.cn/api",
  },
  intl: {
    apiBase: "https://api.z.ai/api",
    subscriptionBase: "https://api.z.ai/api",
  },
};

const ENDPOINT_PATHS: Record<ZhipuEndpoint, string> = {
  general: "/paas/v4",
  coding: "/coding/paas/v4",
};

const ZHIPU_MODELS: ModelInfo[] = [
  // Flagship / High intelligence
  {
    id: "glm-5",
    name: "GLM-5",
    maxOutputTokens: 131072,
    contextWindow: 204800,
    supportsVision: false,
    supportsToolCalling: true,
    supportsStreaming: true,
  },
  {
    id: "glm-5.1",
    name: "GLM-5.1",
    maxOutputTokens: 131072,
    contextWindow: 204800,
    supportsVision: false,
    supportsToolCalling: true,
    supportsStreaming: true,
  },
  {
    id: "glm-5-turbo",
    name: "GLM-5 Turbo",
    maxOutputTokens: 131072,
    contextWindow: 204800,
    supportsVision: false,
    supportsToolCalling: true,
    supportsStreaming: true,
  },
  {
    id: "glm-4.7",
    name: "GLM-4.7",
    maxOutputTokens: 131072,
    contextWindow: 204800,
    supportsVision: false,
    supportsToolCalling: true,
    supportsStreaming: true,
  },
  {
    id: "glm-4.7-flashx",
    name: "GLM-4.7 FlashX",
    maxOutputTokens: 131072,
    contextWindow: 204800,
    supportsVision: false,
    supportsToolCalling: true,
    supportsStreaming: true,
  },
  {
    id: "glm-4.7-flash",
    name: "GLM-4.7 Flash",
    maxOutputTokens: 131072,
    contextWindow: 204800,
    supportsVision: false,
    supportsToolCalling: true,
    supportsStreaming: true,
  },
  {
    id: "glm-4.6",
    name: "GLM-4.6",
    maxOutputTokens: 131072,
    contextWindow: 204800,
    supportsVision: false,
    supportsToolCalling: true,
    supportsStreaming: true,
  },
  // Vision models
  {
    id: "glm-5v-turbo",
    name: "GLM-5V Turbo",
    maxOutputTokens: 131072,
    contextWindow: 204800,
    supportsVision: true,
    supportsToolCalling: true,
    supportsStreaming: true,
  },
  {
    id: "glm-4.6v",
    name: "GLM-4.6V",
    maxOutputTokens: 32768,
    contextWindow: 131072,
    supportsVision: true,
    supportsToolCalling: true,
    supportsStreaming: true,
  },
  {
    id: "glm-4.6v-flash",
    name: "GLM-4.6V Flash",
    maxOutputTokens: 32768,
    contextWindow: 131072,
    supportsVision: true,
    supportsToolCalling: true,
    supportsStreaming: true,
  },
  // Cost-effective
  {
    id: "glm-4.5-air",
    name: "GLM-4.5 Air",
    maxOutputTokens: 98304,
    contextWindow: 131072,
    supportsVision: false,
    supportsToolCalling: true,
    supportsStreaming: true,
  },
  {
    id: "glm-4.5-airx",
    name: "GLM-4.5 AirX",
    maxOutputTokens: 98304,
    contextWindow: 131072,
    supportsVision: false,
    supportsToolCalling: true,
    supportsStreaming: true,
  },
  // Long context
  {
    id: "glm-4-long",
    name: "GLM-4 Long",
    maxOutputTokens: 4096,
    contextWindow: 1048576,
    supportsVision: false,
    supportsToolCalling: true,
    supportsStreaming: true,
  },
  // Free / Flash models
  {
    id: "glm-4-flashx-250414",
    name: "GLM-4 FlashX",
    maxOutputTokens: 16384,
    contextWindow: 131072,
    supportsVision: false,
    supportsToolCalling: true,
    supportsStreaming: true,
  },
  {
    id: "glm-4.5-flash",
    name: "GLM-4.5 Flash",
    maxOutputTokens: 98304,
    contextWindow: 131072,
    supportsVision: false,
    supportsToolCalling: true,
    supportsStreaming: true,
  },
  {
    id: "glm-4-flash-250414",
    name: "GLM-4 Flash",
    maxOutputTokens: 16384,
    contextWindow: 131072,
    supportsVision: false,
    supportsToolCalling: true,
    supportsStreaming: true,
  },
];

export class ZhipuProvider extends OpenAICompatAdapter {
  readonly subscription: SubscriptionClient | null;

  constructor(config: string | ZhipuConfig) {
    const resolved = typeof config === "string" ? { apiKey: config } : config;

    const platform = resolved.platform ?? "cn";
    const endpoint = resolved.endpoint ?? "general";
    const urls = PLATFORM_URLS[platform];
    const endpointPath = ENDPOINT_PATHS[endpoint];
    const chatBaseURL = `${urls.apiBase}${endpointPath}`;

    super({
      id: "zhipu",
      name: "智谱 AI",
      baseURL: chatBaseURL,
      headers: { Authorization: `Bearer ${resolved.apiKey}` },
      models: ZHIPU_MODELS,
    });

    this.subscription =
      endpoint === "coding"
        ? new ZhipuSubscriptionClient(resolved.apiKey, urls.subscriptionBase)
        : null;
  }

  protected override transformRequest(req: ChatRequest): unknown {
    const body = super.transformRequest(req) as Record<string, unknown>;
    const opts = req.providerOptions as Record<string, unknown> | undefined;

    if (opts) {
      if (opts.thinking) {
        body.thinking = opts.thinking;
      }
      if (opts.do_sample !== undefined) {
        body.do_sample = opts.do_sample;
      }
    }

    return body;
  }
}

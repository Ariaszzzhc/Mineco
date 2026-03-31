import { ProviderError } from "./errors.js";
import type { Provider } from "./provider.js";
import { parseSSEStream } from "./sse.js";
import type {
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  ModelInfo,
} from "./types.js";

export abstract class BaseAdapter implements Provider {
  abstract readonly id: string;
  abstract readonly name: string;

  protected abstract getBaseURL(): string;
  protected abstract getHeaders(): Record<string, string>;

  abstract listModels(): ModelInfo[];

  protected transformRequest(req: ChatRequest): unknown {
    return req;
  }

  protected abstract transformResponse(raw: unknown): ChatResponse;
  protected abstract transformStreamChunk(raw: unknown): ChatStreamChunk | null;

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const url = `${this.getBaseURL()}/chat/completions`;
    const body = this.transformRequest({ ...req, stream: false });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.getHeaders(),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw ProviderError.fromResponse(this.id, response.status, errorBody);
    }

    const data = await response.json();
    return this.transformResponse(data);
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<ChatStreamChunk> {
    const url = `${this.getBaseURL()}/chat/completions`;
    const body = this.transformRequest({ ...req, stream: true });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.getHeaders(),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw ProviderError.fromResponse(this.id, response.status, errorBody);
    }

    const stream = response.body;
    if (!stream) {
      throw new ProviderError("Response body is null", this.id, 0);
    }

    for await (const chunk of parseSSEStream(stream)) {
      const parsed: unknown = JSON.parse(chunk);
      const transformed = this.transformStreamChunk(parsed);
      if (transformed) {
        yield transformed;
      }
    }
  }
}

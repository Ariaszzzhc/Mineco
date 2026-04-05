import { getApiBaseUrl } from "./api-base";
import { getPlatform } from "./platform";
import type { AgentEvent } from "./types";

export interface StreamHandle {
  promise: Promise<void>;
  abort: () => void;
}

export function streamChat(
  sessionId: string,
  message: string,
  providerId: string,
  model: string,
  onEvent: (event: AgentEvent) => void,
  baseUrlOverride?: string,
  onConnected?: () => void,
): StreamHandle {
  const controller = new AbortController();

  const promise = (async () => {
    const baseUrl = baseUrlOverride ?? getApiBaseUrl();
    const platform = getPlatform();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (platform.token) {
      headers.Authorization = `Bearer ${platform.token}`;
    }
    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message, providerId, model }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { error?: string }).error ?? `HTTP ${res.status}`,
      );
    }

    // User message is now persisted on the server
    onConnected?.();

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      // Keep the last potentially incomplete part in the buffer
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        if (!part.trim()) continue;

        let _eventType = "";
        let data = "";

        for (const line of part.split("\n")) {
          if (line.startsWith("event: ")) {
            _eventType = line.slice(7);
          } else if (line.startsWith("data: ")) {
            data = line.slice(6);
          }
        }

        if (!data) continue;

        try {
          const event = JSON.parse(data) as AgentEvent;
          onEvent(event);
        } catch (e) {
          console.warn("Failed to parse SSE event:", data, e);
        }
      }
    }
  })();

  return {
    promise,
    abort: () => controller.abort(),
  };
}

import type {
  AppConfig,
  AppSettings,
  ProviderConfig,
  Session,
} from "./types";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      (body as { error?: string }).error ?? res.statusText,
    );
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  const json = (await res.json()) as { data?: T } | T;
  return (json as { data: T }).data ?? (json as T);
}

export const api = {
  // Sessions
  createSession(): Promise<Session> {
    return request("/api/sessions", { method: "POST" });
  },

  listSessions(): Promise<Session[]> {
    return request("/api/sessions");
  },

  getSession(id: string): Promise<Session> {
    return request(`/api/sessions/${id}`);
  },

  deleteSession(id: string): Promise<void> {
    return request(`/api/sessions/${id}`, { method: "DELETE" });
  },

  // Config
  getConfig(): Promise<AppConfig> {
    return request("/api/config");
  },

  updateConfig(config: unknown): Promise<AppConfig> {
    return request("/api/config", {
      method: "PUT",
      body: JSON.stringify(config),
    });
  },

  // Providers
  getProviders(): Promise<ProviderConfig[]> {
    return request("/api/config/providers");
  },

  addProvider(provider: unknown): Promise<ProviderConfig[]> {
    return request("/api/config/providers", {
      method: "POST",
      body: JSON.stringify(provider),
    });
  },

  deleteProvider(id: string): Promise<ProviderConfig[]> {
    return request(`/api/config/providers/${id}`, {
      method: "DELETE",
    });
  },

  // Settings
  getSettings(): Promise<AppSettings> {
    return request("/api/config/settings");
  },

  updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    return request("/api/config/settings", {
      method: "PATCH",
      body: JSON.stringify(settings),
    });
  },
};

export { ApiError };

import type {
  AppConfig,
  AppSettings,
  ProviderConfig,
  Session,
  Workspace,
} from "./types";
import { getApiBaseUrl } from "./api-base";

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
  const baseUrl = await getApiBaseUrl();
  const res = await fetch(`${baseUrl}${path}`, {
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
  // Workspaces
  listWorkspaces(): Promise<Workspace[]> {
    return request("/api/workspaces");
  },

  createWorkspace(path: string): Promise<Workspace> {
    return request("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ path }),
    });
  },

  openWorkspace(id: string): Promise<Workspace> {
    return request(`/api/workspaces/${id}/open`, { method: "POST" });
  },

  deleteWorkspace(id: string): Promise<void> {
    return request(`/api/workspaces/${id}`, { method: "DELETE" });
  },

  // Filesystem browsing
  browseFs(path?: string): Promise<{
    currentPath: string;
    parentPath: string | null;
    directories: Array<{ name: string; path: string }>;
  }> {
    const query = path ? `?path=${encodeURIComponent(path)}` : "";
    return request(`/api/fs/browse${query}`);
  },

  // Sessions
  createSession(workspaceId: string): Promise<Session> {
    return request("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ workspaceId }),
    });
  },

  listSessions(workspaceId?: string): Promise<Session[]> {
    const query = workspaceId ? `?workspaceId=${workspaceId}` : "";
    return request(`/api/sessions${query}`);
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

  getProviderModels(): Promise<Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }>> {
    return request("/api/config/providers/models");
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

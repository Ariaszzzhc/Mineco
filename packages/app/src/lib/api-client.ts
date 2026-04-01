import type { AppType } from "@mineco/core";
import { hc } from "hono/client";
import { getApiBaseUrl } from "./api-base";
import { getPlatform } from "./platform";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Client = ReturnType<typeof hc<AppType>>;
let _client: Client | null = null;

function getClient(): Client {
  if (!_client) {
    const platform = getPlatform();
    const options = platform.token
      ? { headers: { Authorization: `Bearer ${platform.token}` } }
      : {};
    _client = hc<AppType>(getApiBaseUrl(), options);
  }
  return _client;
}

export const api = {
  // Workspaces
  async listWorkspaces() {
    const client = getClient();
    const res = await client.api.workspaces.$get();
    if (!res.ok) throw new ApiError(res.status, await extractError(res));
    return res.json();
  },

  async createWorkspace(path: string) {
    const client = getClient();
    const res = await client.api.workspaces.$post({ json: { path } });
    if (!res.ok) throw new ApiError(res.status, await extractError(res));
    return res.json();
  },

  async openWorkspace(id: string) {
    const client = getClient();
    const res = await client.api.workspaces[":id"].open.$post({
      param: { id },
    });
    if (!res.ok) throw new ApiError(res.status, await extractError(res));
    return res.json();
  },

  async deleteWorkspace(id: string) {
    const client = getClient();
    const res = await client.api.workspaces[":id"].$delete({ param: { id } });
    if (!res.ok) throw new ApiError(res.status, await extractError(res));
  },

  // Filesystem browsing
  async browseFs(path?: string) {
    const client = getClient();
    const res = await client.api.fs.browse.$get({
      query: { path: path ?? undefined },
    });
    if (!res.ok) throw new ApiError(res.status, await extractError(res));
    return res.json();
  },

  // Sessions
  async createSession(workspaceId: string) {
    const client = getClient();
    const res = await client.api.sessions.$post({ json: { workspaceId } });
    if (!res.ok) throw new ApiError(res.status, await extractError(res));
    return res.json();
  },

  async listSessions(workspaceId?: string) {
    const client = getClient();
    const query = workspaceId ? { workspaceId } : undefined;
    const res = await client.api.sessions.$get({ query });
    if (!res.ok) throw new ApiError(res.status, await extractError(res));
    return res.json();
  },

  async getSession(id: string) {
    const client = getClient();
    const res = await client.api.sessions[":id"].$get({ param: { id } });
    if (!res.ok) throw new ApiError(res.status, await extractError(res));
    return res.json();
  },

  async deleteSession(id: string) {
    const client = getClient();
    const res = await client.api.sessions[":id"].$delete({ param: { id } });
    if (!res.ok) throw new ApiError(res.status, await extractError(res));
  },

  async updateSessionTitle(id: string, title: string) {
    const client = getClient();
    const res = await client.api.sessions[":id"].$patch({
      param: { id },
      json: { title },
    });
    if (!res.ok) throw new ApiError(res.status, await extractError(res));
    return res.json();
  },

  // Config
  async getConfig() {
    const client = getClient();
    const res = await client.api.config.$get();
    if (!res.ok) throw new ApiError(res.status, await extractError(res));
    return res.json();
  },

  async updateConfig(config: unknown) {
    const client = getClient();
    const res = await client.api.config.$put({
      json: config as Record<string, unknown>,
    });
    if (!res.ok) throw new ApiError(res.status, await extractError(res));
    return res.json();
  },

  // Providers
  async getProviders() {
    const client = getClient();
    const res = await client.api.config.providers.$get();
    if (!res.ok) throw new ApiError(res.status, await extractError(res));
    return res.json();
  },

  async getProviderModels() {
    const client = getClient();
    const res = await client.api.config.providers.models.$get();
    if (!res.ok) throw new ApiError(res.status, await extractError(res));
    return res.json();
  },

  async addProvider(provider: unknown) {
    const client = getClient();
    const res = await client.api.config.providers.$post({
      json: provider as Record<string, unknown>,
    });
    if (!res.ok) throw new ApiError(res.status, await extractError(res));
    return res.json();
  },

  async deleteProvider(id: string) {
    const client = getClient();
    const res = await client.api.config.providers[":id"].$delete({
      param: { id },
    });
    if (!res.ok) throw new ApiError(res.status, await extractError(res));
    return res.json();
  },

  // Settings
  async getSettings() {
    const client = getClient();
    const res = await client.api.config.settings.$get();
    if (!res.ok) throw new ApiError(res.status, await extractError(res));
    return res.json();
  },

  async updateSettings(settings: Record<string, unknown>) {
    const client = getClient();
    const res = await client.api.config.settings.$patch({
      json: settings as Record<string, unknown>,
    });
    if (!res.ok) throw new ApiError(res.status, await extractError(res));
    return res.json();
  },
};

async function extractError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as Record<string, unknown>;
    return (body.error as string) ?? res.statusText ?? `HTTP ${res.status}`;
  } catch {
    return res.statusText ?? `HTTP ${res.status}`;
  }
}

export { ApiError };

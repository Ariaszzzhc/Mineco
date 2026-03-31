import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, ApiError } from "../../src/lib/api-client";

function mockResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(
    status === 204 ? null : JSON.stringify(body),
    {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    },
  );
}

describe("ApiError", () => {
  it("should set name, status, and message", () => {
    const err = new ApiError(404, "Not found");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ApiError");
    expect(err.status).toBe(404);
    expect(err.message).toBe("Not found");
  });
});

describe("request", () => {
  const mockFetch = vi.fn<(input: RequestInfo, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  it("should send request via Hono client", async () => {
    mockFetch.mockResolvedValue(mockResponse({ data: "ok" }));
    await api.listWorkspaces();
    expect(mockFetch).toHaveBeenCalledWith("/api/workspaces", expect.objectContaining({
      method: "GET",
    }));
  });

  it("should return raw JSON response", async () => {
    const session = { id: "1", title: "Test" };
    mockFetch.mockResolvedValue(mockResponse(session));
    const result = await api.createSession("ws-1");
    expect(result).toEqual(session);
  });

  it("should return raw value when no data wrapper", async () => {
    const sessions = [{ id: "1" }];
    mockFetch.mockResolvedValue(mockResponse(sessions));
    const result = await api.listSessions();
    expect(result).toEqual(sessions);
  });

  it("should throw ApiError on non-ok with body error", async () => {
    mockFetch.mockResolvedValue(mockResponse({ error: "Not found" }, 404));
    try {
      await api.getSession("x");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(404);
      expect((err as ApiError).message).toBe("Not found");
    }
  });

  it("should fall back to statusText when no body error", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 500,
        statusText: "Internal Server Error",
      }),
    );
    try {
      await api.getConfig();
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe("Internal Server Error");
    }
  });

  it("should return undefined for 204 status", async () => {
    mockFetch.mockResolvedValue(mockResponse(null, 204));
    const result = await api.deleteSession("x");
    expect(result).toBeUndefined();
  });

  it("should return undefined for content-length 0", async () => {
    mockFetch.mockResolvedValue(
      mockResponse(null, 200, { "Content-Length": "0" }),
    );
    const result = await api.deleteSession("x");
    expect(result).toBeUndefined();
  });

  it("should handle malformed JSON in error body", async () => {
    mockFetch.mockResolvedValue(
      new Response("not json", { status: 500, statusText: "Internal Server Error" }),
    );
    try {
      await api.getConfig();
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe("Internal Server Error");
    }
  });
});

describe("api methods", () => {
  const mockFetch = vi.fn<(input: RequestInfo, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockResponse({ data: null }));
  });

  it("createSession should POST /api/sessions with workspaceId", async () => {
    await api.createSession("ws-1");
    expect(mockFetch).toHaveBeenCalledWith("/api/sessions", expect.objectContaining({
      method: "POST",
    }));
  });

  it("listSessions should GET /api/sessions", async () => {
    await api.listSessions();
    expect(mockFetch).toHaveBeenCalledWith("/api/sessions", expect.objectContaining({ headers: expect.any(Object) }));
  });

  it("getSession should GET /api/sessions/:id", async () => {
    await api.getSession("abc");
    expect(mockFetch).toHaveBeenCalledWith("/api/sessions/abc", expect.any(Object));
  });

  it("deleteSession should DELETE /api/sessions/:id", async () => {
    await api.deleteSession("abc");
    expect(mockFetch).toHaveBeenCalledWith("/api/sessions/abc", expect.objectContaining({ method: "DELETE" }));
  });

  it("getConfig should GET /api/config", async () => {
    await api.getConfig();
    expect(mockFetch).toHaveBeenCalledWith("/api/config", expect.any(Object));
  });

  it("updateConfig should PUT /api/config with body", async () => {
    await api.updateConfig({ providers: [] });
    expect(mockFetch).toHaveBeenCalledWith("/api/config", expect.objectContaining({ method: "PUT" }));
  });

  it("getProviders should GET /api/config/providers", async () => {
    await api.getProviders();
    expect(mockFetch).toHaveBeenCalledWith("/api/config/providers", expect.any(Object));
  });

  it("getProviderModels should GET /api/config/providers/models", async () => {
    await api.getProviderModels();
    expect(mockFetch).toHaveBeenCalledWith("/api/config/providers/models", expect.any(Object));
  });

  it("addProvider should POST /api/config/providers with body", async () => {
    await api.addProvider({ type: "zhipu" });
    expect(mockFetch).toHaveBeenCalledWith("/api/config/providers", expect.objectContaining({ method: "POST" }));
  });

  it("deleteProvider should DELETE /api/config/providers/:id", async () => {
    await api.deleteProvider("zhipu");
    expect(mockFetch).toHaveBeenCalledWith("/api/config/providers/zhipu", expect.objectContaining({ method: "DELETE" }));
  });

  it("getSettings should GET /api/config/settings", async () => {
    await api.getSettings();
    expect(mockFetch).toHaveBeenCalledWith("/api/config/settings", expect.any(Object));
  });

  it("updateSettings should PATCH /api/config/settings with body", async () => {
    await api.updateSettings({ defaultProvider: "zhipu" });
    expect(mockFetch).toHaveBeenCalledWith("/api/config/settings", expect.objectContaining({ method: "PATCH" }));
  });
});

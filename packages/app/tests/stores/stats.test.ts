import { beforeEach, describe, expect, it, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  getStatsSummary: vi.fn(),
  getStatsDaily: vi.fn(),
  getStatsByModel: vi.fn(),
  getSessionStats: vi.fn(),
}));

vi.mock("../../src/lib/api-client", () => ({
  api: mockApi,
}));

import { statsStore } from "../../src/stores/stats";

const mockSummary = {
  totalTokens: 15000,
  totalCost: 0.25,
  totalRequests: 10,
  byProvider: {
    zhipu: { totalTokens: 10000, totalCost: 0.15, requests: 7 },
    deepseek: { totalTokens: 5000, totalCost: 0.1, requests: 3 },
  },
  byModel: [
    {
      providerId: "zhipu",
      model: "glm-5",
      requests: 7,
      promptTokens: 7000,
      completionTokens: 3000,
      totalTokens: 10000,
      cost: 0.15,
    },
    {
      providerId: "deepseek",
      model: "deepseek-v3",
      requests: 3,
      promptTokens: 3000,
      completionTokens: 2000,
      totalTokens: 5000,
      cost: 0.1,
    },
  ],
};

const mockDaily = [
  {
    date: "2026-04-01",
    providerId: "zhipu",
    model: "glm-5",
    requests: 5,
    promptTokens: 5000,
    completionTokens: 2000,
    totalTokens: 7000,
    cost: 0.1,
  },
  {
    date: "2026-04-02",
    providerId: "zhipu",
    model: "glm-5",
    requests: 2,
    promptTokens: 2000,
    completionTokens: 1000,
    totalTokens: 3000,
    cost: 0.05,
  },
  {
    date: "2026-04-01",
    providerId: "deepseek",
    model: "deepseek-v3",
    requests: 3,
    promptTokens: 3000,
    completionTokens: 2000,
    totalTokens: 5000,
    cost: 0.1,
  },
];

const mockByModel = [
  {
    providerId: "zhipu",
    model: "glm-5",
    requests: 7,
    promptTokens: 7000,
    completionTokens: 3000,
    totalTokens: 10000,
    cost: 0.15,
  },
  {
    providerId: "deepseek",
    model: "deepseek-v3",
    requests: 3,
    promptTokens: 3000,
    completionTokens: 2000,
    totalTokens: 5000,
    cost: 0.1,
  },
];

const mockSessionStats = {
  sessionId: "session-1",
  totalTokens: 5000,
  totalCost: 0.08,
  totalRequests: 5,
  byModel: [
    {
      providerId: "zhipu",
      model: "glm-5",
      requests: 5,
      promptTokens: 3000,
      completionTokens: 2000,
      totalTokens: 5000,
      cost: 0.08,
    },
  ],
};

describe("statsStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getStatsSummary.mockResolvedValue(mockSummary);
    mockApi.getStatsDaily.mockResolvedValue(mockDaily);
    mockApi.getStatsByModel.mockResolvedValue(mockByModel);
    mockApi.getSessionStats.mockResolvedValue(mockSessionStats);
  });

  describe("initial state", () => {
    it("should have null summary initially", () => {
      expect(statsStore.summary()).toBeNull();
    });

    it("should have empty daily array", () => {
      expect(statsStore.daily()).toEqual([]);
    });

    it("should not be loading", () => {
      expect(statsStore.loading()).toBe(false);
    });

    it("should have no error", () => {
      expect(statsStore.error()).toBeNull();
    });

    it("should default to 7d date range", () => {
      expect(statsStore.dateRange()).toBe("7d");
    });
  });

  describe("setDateRange", () => {
    it("should load all data when range is set", async () => {
      await statsStore.setDateRange("7d");

      expect(mockApi.getStatsSummary).toHaveBeenCalled();
      expect(mockApi.getStatsDaily).toHaveBeenCalled();
      expect(mockApi.getStatsByModel).toHaveBeenCalled();
    });

    it("should update dateRange state", async () => {
      await statsStore.setDateRange("30d");
      expect(statsStore.dateRange()).toBe("30d");
    });

    it("should pass correct date range for 7d", async () => {
      await statsStore.setDateRange("7d");
      const call = mockApi.getStatsDaily.mock.calls[0] as [string, string];
      const [from, to] = call;
      const fromDate = new Date(from);
      const toDate = new Date(to);
      const diffDays = Math.round(
        (toDate.getTime() - fromDate.getTime()) / 86_400_000,
      );
      expect(diffDays).toBe(7);
    });

    it("should pass correct date range for today", async () => {
      await statsStore.setDateRange("today");
      const call = mockApi.getStatsDaily.mock.calls[0] as [string, string];
      expect(call[0]).toBe(call[1]);
    });

    it("should pass correct date range for 30d", async () => {
      await statsStore.setDateRange("30d");
      const call = mockApi.getStatsDaily.mock.calls[0] as [string, string];
      const [from, to] = call;
      const diffDays = Math.round(
        (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000,
      );
      expect(diffDays).toBe(30);
    });

    it("should not call getStatsDaily for all range (no date filter)", async () => {
      await statsStore.setDateRange("all");
      expect(mockApi.getStatsDaily).not.toHaveBeenCalled();
      expect(statsStore.daily()).toEqual([]);
    });

    it("should update summary from API response", async () => {
      await statsStore.setDateRange("7d");
      expect(statsStore.summary()).toEqual(mockSummary);
    });

    it("should update daily from API response", async () => {
      await statsStore.setDateRange("7d");
      expect(statsStore.daily()).toEqual(mockDaily);
    });

    it("should update byModel from API response", async () => {
      await statsStore.setDateRange("7d");
      expect(statsStore.byModel()).toEqual(mockByModel);
    });
  });

  describe("loading state", () => {
    it("should set loading to true during fetch", async () => {
      let loadingDuringFetch = false;
      mockApi.getStatsSummary.mockImplementation(async () => {
        loadingDuringFetch = statsStore.loading();
        return mockSummary;
      });

      await statsStore.setDateRange("7d");
      expect(loadingDuringFetch).toBe(true);
    });

    it("should set loading to false after success", async () => {
      await statsStore.setDateRange("7d");
      expect(statsStore.loading()).toBe(false);
    });

    it("should set loading to false after error", async () => {
      mockApi.getStatsSummary.mockRejectedValue(new Error("Network error"));

      try {
        await statsStore.setDateRange("7d");
      } catch {
        /* expected */
      }

      expect(statsStore.loading()).toBe(false);
    });
  });

  describe("error handling", () => {
    it("should set error on API failure", async () => {
      mockApi.getStatsSummary.mockRejectedValue(new Error("Network error"));

      try {
        await statsStore.setDateRange("7d");
      } catch {
        /* expected */
      }

      expect(statsStore.error()).toBe("Network error");
    });

    it("should clear error on next successful load", async () => {
      mockApi.getStatsSummary.mockRejectedValueOnce(new Error("fail"));
      try {
        await statsStore.setDateRange("7d");
      } catch {
        /* expected */
      }
      expect(statsStore.error()).toBe("fail");

      mockApi.getStatsSummary.mockResolvedValueOnce(mockSummary);
      await statsStore.setDateRange("7d");
      expect(statsStore.error()).toBeNull();
    });
  });

  describe("getSessionUsage", () => {
    it("should call API and return session stats", async () => {
      const result = await statsStore.getSessionUsage("session-1");
      expect(mockApi.getSessionStats).toHaveBeenCalledWith("session-1");
      expect(result).toEqual(mockSessionStats);
    });

    it("should propagate API errors", async () => {
      mockApi.getSessionStats.mockRejectedValue(new Error("Not found"));
      await expect(statsStore.getSessionUsage("non-existent")).rejects.toThrow(
        "Not found",
      );
    });
  });
});

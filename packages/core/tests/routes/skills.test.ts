import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSkillsRoutes } from "../../src/routes/skills.js";

vi.mock("@mineco/agent", () => {
  return {
    SkillScanner: vi.fn().mockImplementation(function () {
      return { scan: vi.fn() };
    }),
  };
});

import { SkillScanner } from "@mineco/agent";

const MockedSkillScanner = vi.mocked(SkillScanner);

describe("Skills Routes", () => {
  let app: ReturnType<typeof createSkillsRoutes>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createSkillsRoutes();
  });

  function getScannerInstance() {
    return MockedSkillScanner.mock.results[0].value;
  }

  describe("GET /", () => {
    it("should return 400 when workspacePath is missing", async () => {
      const res = await app.request("/");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("workspacePath is required");
    });

    it("should return skills from scanner", async () => {
      const manifests = [
        {
          name: "my-skill",
          description: "A test skill",
          instructions: "Do something useful",
          sourcePath: "/tmp/.agents/skills/my-skill/SKILL.md",
          source: "user" as const,
        },
      ];
      getScannerInstance().scan = vi.fn(async () => manifests);

      const res = await app.request("/?workspacePath=/tmp/project");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(manifests);
      expect(getScannerInstance().scan).toHaveBeenCalledWith("/tmp/project");
    });

    it("should return empty array when no skills found", async () => {
      getScannerInstance().scan = vi.fn(async () => []);

      const res = await app.request("/?workspacePath=/tmp/project");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it("should pass workspacePath to scanner", async () => {
      getScannerInstance().scan = vi.fn(async () => []);

      await app.request("/?workspacePath=/custom/path");
      expect(getScannerInstance().scan).toHaveBeenCalledWith("/custom/path");
    });
  });
});

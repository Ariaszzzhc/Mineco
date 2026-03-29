import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/prompt.js";

describe("buildSystemPrompt", () => {
  it("includes all template variables", () => {
    const prompt = buildSystemPrompt({
      workingDir: "/home/user/project",
      platform: "linux",
      date: "2026-03-30",
      model: "gpt-4",
    });

    expect(prompt).toContain("/home/user/project");
    expect(prompt).toContain("linux");
    expect(prompt).toContain("2026-03-30");
    expect(prompt).toContain("gpt-4");
  });

  it("includes key instruction sections", () => {
    const prompt = buildSystemPrompt({
      workingDir: "/tmp",
      platform: "test",
      date: "2026-01-01",
      model: "test",
    });

    expect(prompt).toContain("Tone and style");
    expect(prompt).toContain("Tool usage policy");
    expect(prompt).toContain("Security");
  });
});

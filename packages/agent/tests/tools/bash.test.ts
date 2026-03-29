import { describe, expect, it } from "vitest";
import { bashTool } from "../../src/tools/bash.js";

describe("bashTool", () => {
  it("returns stdout on success", async () => {
    const result = await bashTool.execute(
      { command: "echo hello" },
      { workingDir: process.cwd() },
    );
    expect(result.isError).toBeUndefined();
    expect(result.output.trim()).toBe("hello");
  });

  it("returns isError on non-zero exit", async () => {
    const result = await bashTool.execute(
      { command: "exit 1" },
      { workingDir: process.cwd() },
    );
    expect(result.isError).toBe(true);
  });

  it("returns isError for empty command", async () => {
    const result = await bashTool.execute(
      { command: "" },
      { workingDir: process.cwd() },
    );
    expect(result.isError).toBe(true);
  });

  it("includes stderr in output", async () => {
    const result = await bashTool.execute(
      { command: "echo err >&2 && echo out" },
      { workingDir: process.cwd() },
    );
    expect(result.output).toContain("err");
    expect(result.output).toContain("out");
  });
});

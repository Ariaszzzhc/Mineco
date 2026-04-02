import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { grepTool } from "../../src/tools/grep.js";

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `mineco-grep-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("grepTool", () => {
  it("isConcurrencySafe returns true", () => {
    expect(grepTool.isConcurrencySafe?.({ pattern: "x" })).toBe(true);
  });

  it("finds pattern in a single file", async () => {
    await writeFile(
      join(testDir, "a.ts"),
      "const hello = 'world';\nconst foo = 'bar';",
      "utf-8",
    );
    const result = await grepTool.execute(
      { pattern: "hello" },
      { workingDir: testDir },
    );
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain("hello");
    expect(result.output).toContain("Line");
  });

  it("searches across multiple files", async () => {
    await mkdir(join(testDir, "sub"), { recursive: true });
    await writeFile(join(testDir, "a.ts"), "function greet() {}", "utf-8");
    await writeFile(
      join(testDir, "sub", "b.ts"),
      "function greetUser() {}",
      "utf-8",
    );

    const result = await grepTool.execute(
      { pattern: "greet" },
      { workingDir: testDir },
    );
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain("a.ts");
    expect(result.output).toContain("b.ts");
  });

  it("respects include filter", async () => {
    await writeFile(join(testDir, "a.ts"), "searchMe", "utf-8");
    await writeFile(join(testDir, "b.js"), "searchMe", "utf-8");

    const result = await grepTool.execute(
      { pattern: "searchMe", include: "*.ts" },
      { workingDir: testDir },
    );
    expect(result.output).toContain("a.ts");
    expect(result.output).not.toContain("b.js");
  });

  it("resolves relative path from workingDir", async () => {
    const subDir = join(testDir, "src");
    await mkdir(subDir, { recursive: true });
    await writeFile(join(subDir, "code.ts"), "findThis", "utf-8");

    const result = await grepTool.execute(
      { pattern: "findThis", path: "src" },
      { workingDir: testDir },
    );
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain("findThis");
  });

  it("returns 'No files found' for no matches", async () => {
    await writeFile(join(testDir, "a.ts"), "hello world", "utf-8");
    const result = await grepTool.execute(
      { pattern: "nonexistent_pattern_xyz" },
      { workingDir: testDir },
    );
    expect(result.output).toContain("No files found");
  });

  it("returns isError for empty pattern", async () => {
    const result = await grepTool.execute(
      { pattern: "" },
      { workingDir: testDir },
    );
    expect(result.isError).toBe(true);
  });

  it("uses absolute path directly", async () => {
    await writeFile(join(testDir, "abs.txt"), "absoluteMatch", "utf-8");
    const result = await grepTool.execute(
      { pattern: "absoluteMatch", path: testDir },
      { workingDir: "/other" },
    );
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain("absoluteMatch");
  });
});

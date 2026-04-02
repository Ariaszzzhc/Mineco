import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { globTool } from "../../src/tools/glob.js";

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `mineco-glob-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("globTool", () => {
  it("isConcurrencySafe returns true", () => {
    expect(globTool.isConcurrencySafe?.({ pattern: "*.ts" })).toBe(true);
  });

  it("finds files matching glob pattern", async () => {
    await writeFile(join(testDir, "a.ts"), "content", "utf-8");
    await writeFile(join(testDir, "b.ts"), "content", "utf-8");
    await writeFile(join(testDir, "c.js"), "content", "utf-8");

    const result = await globTool.execute(
      { pattern: "*.ts" },
      { workingDir: testDir },
    );
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain("a.ts");
    expect(result.output).toContain("b.ts");
    expect(result.output).not.toContain("c.js");
  });

  it("finds files in nested directories", async () => {
    await mkdir(join(testDir, "src"), { recursive: true });
    await writeFile(join(testDir, "src", "index.ts"), "content", "utf-8");
    await writeFile(join(testDir, "package.json"), "{}", "utf-8");

    const result = await globTool.execute(
      { pattern: "**/*.ts" },
      { workingDir: testDir },
    );
    expect(result.output).toContain("index.ts");
  });

  it("resolves relative path from workingDir", async () => {
    const subDir = join(testDir, "packages");
    await mkdir(subDir, { recursive: true });
    await writeFile(join(subDir, "foo.ts"), "content", "utf-8");

    const result = await globTool.execute(
      { pattern: "*.ts", path: "packages" },
      { workingDir: testDir },
    );
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain("foo.ts");
  });

  it("returns 'No files found' for no matches", async () => {
    await writeFile(join(testDir, "a.ts"), "content", "utf-8");

    const result = await globTool.execute(
      { pattern: "*.xyz" },
      { workingDir: testDir },
    );
    expect(result.output).toContain("No files found");
  });

  it("returns isError for empty pattern", async () => {
    const result = await globTool.execute(
      { pattern: "" },
      { workingDir: testDir },
    );
    expect(result.isError).toBe(true);
  });

  it("uses absolute path directly", async () => {
    await writeFile(join(testDir, "abs.ts"), "content", "utf-8");

    const result = await globTool.execute(
      { pattern: "*.ts", path: testDir },
      { workingDir: "/other" },
    );
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain("abs.ts");
  });
});

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lsTool } from "../../src/tools/ls.js";

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `mineco-ls-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("lsTool", () => {
  it("isConcurrencySafe returns true", () => {
    expect(lsTool.isConcurrencySafe?.({})).toBe(true);
  });

  it("lists directory with tree structure", async () => {
    await mkdir(join(testDir, "src"), { recursive: true });
    await writeFile(join(testDir, "src", "index.ts"), "content", "utf-8");
    await writeFile(join(testDir, "package.json"), "{}", "utf-8");

    const result = await lsTool.execute({}, { workingDir: testDir });
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain("src/");
    expect(result.output).toContain("index.ts");
    expect(result.output).toContain("package.json");
  });

  it("shows nested directories", async () => {
    await mkdir(join(testDir, "src", "components"), { recursive: true });
    await writeFile(
      join(testDir, "src", "components", "Button.tsx"),
      "export {}",
      "utf-8",
    );
    await writeFile(join(testDir, "src", "index.ts"), "content", "utf-8");

    const result = await lsTool.execute({}, { workingDir: testDir });
    expect(result.output).toContain("components/");
    expect(result.output).toContain("Button.tsx");
    expect(result.output).toContain("index.ts");
  });

  it("ignores node_modules and .git", async () => {
    await mkdir(join(testDir, "node_modules", "pkg"), { recursive: true });
    await mkdir(join(testDir, ".git"), { recursive: true });
    await writeFile(
      join(testDir, "node_modules", "pkg", "index.js"),
      "code",
      "utf-8",
    );
    await writeFile(join(testDir, "visible.ts"), "content", "utf-8");

    const result = await lsTool.execute({}, { workingDir: testDir });
    expect(result.output).toContain("visible.ts");
    expect(result.output).not.toContain("node_modules");
    expect(result.output).not.toContain(".git");
  });

  it("resolves relative path from workingDir", async () => {
    const subDir = join(testDir, "subdir");
    await mkdir(subDir, { recursive: true });
    await writeFile(join(subDir, "file.txt"), "content", "utf-8");

    const result = await lsTool.execute(
      { path: "subdir" },
      { workingDir: testDir },
    );
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain("file.txt");
  });

  it("returns isError for non-existent directory", async () => {
    const result = await lsTool.execute(
      { path: "/nonexistent/path/xyz" },
      { workingDir: testDir },
    );
    expect(result.isError).toBe(true);
    expect(result.output).toContain("not found");
  });

  it("uses absolute path directly", async () => {
    await writeFile(join(testDir, "abs.txt"), "content", "utf-8");

    const result = await lsTool.execute(
      { path: testDir },
      { workingDir: "/other" },
    );
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain("abs.txt");
  });
});

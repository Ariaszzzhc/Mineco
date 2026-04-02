import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileTool } from "../../src/tools/read.js";

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `mineco-read-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("readFileTool", () => {
  it("isConcurrencySafe returns true", () => {
    expect(readFileTool.isConcurrencySafe?.({ file_path: "x" })).toBe(true);
  });

  it("reads file with line numbers", async () => {
    await writeFile(join(testDir, "a.txt"), "line1\nline2\nline3", "utf-8");
    const result = await readFileTool.execute(
      { file_path: join(testDir, "a.txt") },
      { workingDir: testDir },
    );
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain("1\tline1");
    expect(result.output).toContain("2\tline2");
    expect(result.output).toContain("(total 3 lines)");
  });

  it("respects offset parameter", async () => {
    await writeFile(join(testDir, "b.txt"), "a\nb\nc\nd\ne", "utf-8");
    const result = await readFileTool.execute(
      { file_path: join(testDir, "b.txt"), offset: 3 },
      { workingDir: testDir },
    );
    expect(result.output).toContain("3\tc");
    expect(result.output).not.toContain("1\ta");
    expect(result.output).toContain("(total 5 lines)");
  });

  it("respects limit parameter", async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join(
      "\n",
    );
    await writeFile(join(testDir, "c.txt"), lines, "utf-8");
    const result = await readFileTool.execute(
      { file_path: join(testDir, "c.txt"), limit: 3 },
      { workingDir: testDir },
    );
    expect(result.output).toContain("1\tline1");
    expect(result.output).toContain("3\tline3");
    expect(result.output).not.toContain("4\tline4");
  });

  it("resolves relative path from workingDir", async () => {
    await writeFile(join(testDir, "rel.txt"), "content", "utf-8");
    const result = await readFileTool.execute(
      { file_path: "rel.txt" },
      { workingDir: testDir },
    );
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain("content");
  });

  it("uses absolute path directly", async () => {
    const absPath = join(testDir, "abs.txt");
    await writeFile(absPath, "absolute", "utf-8");
    const result = await readFileTool.execute(
      { file_path: absPath },
      { workingDir: "/other" },
    );
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain("absolute");
  });

  it("returns isError for missing file", async () => {
    const result = await readFileTool.execute(
      { file_path: join(testDir, "nope.txt") },
      { workingDir: testDir },
    );
    expect(result.isError).toBe(true);
  });

  it("returns isError for empty file_path", async () => {
    const result = await readFileTool.execute(
      { file_path: "" },
      { workingDir: testDir },
    );
    expect(result.isError).toBe(true);
  });
});

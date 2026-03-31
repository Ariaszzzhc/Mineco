import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFileTool } from "../../src/tools/write.js";

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `mineco-write-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("writeFileTool", () => {
  it("creates a new file", async () => {
    const filePath = join(testDir, "new.txt");
    const result = await writeFileTool.execute(
      { file_path: filePath, content: "hello" },
      { workingDir: testDir },
    );
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain("Successfully");

    const written = await readFile(filePath, "utf-8");
    expect(written).toBe("hello");
  });

  it("overwrites existing file", async () => {
    const filePath = join(testDir, "overwrite.txt");
    await writeFileTool.execute(
      { file_path: filePath, content: "old" },
      { workingDir: testDir },
    );
    await writeFileTool.execute(
      { file_path: filePath, content: "new" },
      { workingDir: testDir },
    );

    const written = await readFile(filePath, "utf-8");
    expect(written).toBe("new");
  });

  it("creates parent directories automatically", async () => {
    const filePath = join(testDir, "deep", "nested", "dir", "file.txt");
    await writeFileTool.execute(
      { file_path: filePath, content: "nested" },
      { workingDir: testDir },
    );

    const written = await readFile(filePath, "utf-8");
    expect(written).toBe("nested");
  });

  it("resolves relative path from workingDir", async () => {
    await writeFileTool.execute(
      { file_path: "relative.txt", content: "rel" },
      { workingDir: testDir },
    );

    const written = await readFile(join(testDir, "relative.txt"), "utf-8");
    expect(written).toBe("rel");
  });

  it("returns isError for empty file_path", async () => {
    const result = await writeFileTool.execute(
      { file_path: "", content: "data" },
      { workingDir: testDir },
    );
    expect(result.isError).toBe(true);
  });
});

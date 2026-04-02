import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { editTool } from "../../src/tools/edit.js";

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `mineco-edit-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("editTool", () => {
  it("isConcurrencySafe returns false", () => {
    expect(editTool.isConcurrencySafe?.({ file_path: "x", old_string: "a", new_string: "b" })).toBe(false);
  });

  it("replaces unique string in file", async () => {
    const filePath = join(testDir, "a.ts");
    await writeFile(filePath, "const old = 'value';", "utf-8");

    const result = await editTool.execute(
      { file_path: filePath, old_string: "old = 'value'", new_string: "new = 'updated'" },
      { workingDir: testDir },
    );
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain("Successfully");

    const content = await readFile(filePath, "utf-8");
    expect(content).toBe("const new = 'updated';");
  });

  it("handles replace_all for multiple occurrences", async () => {
    const filePath = join(testDir, "b.ts");
    await writeFile(filePath, "foo foo foo", "utf-8");

    const result = await editTool.execute(
      { file_path: filePath, old_string: "foo", new_string: "bar", replace_all: true },
      { workingDir: testDir },
    );
    expect(result.isError).toBeUndefined();

    const content = await readFile(filePath, "utf-8");
    expect(content).toBe("bar bar bar");
  });

  it("returns error when old_string not found", async () => {
    const filePath = join(testDir, "c.ts");
    await writeFile(filePath, "hello world", "utf-8");

    const result = await editTool.execute(
      { file_path: filePath, old_string: "nonexistent", new_string: "replacement" },
      { workingDir: testDir },
    );
    expect(result.isError).toBe(true);
    expect(result.output).toContain("not found");
  });

  it("returns error for multiple matches without replace_all", async () => {
    const filePath = join(testDir, "d.ts");
    await writeFile(filePath, "abc abc", "utf-8");

    const result = await editTool.execute(
      { file_path: filePath, old_string: "abc", new_string: "xyz" },
      { workingDir: testDir },
    );
    expect(result.isError).toBe(true);
    expect(result.output).toContain("2 occurrences");
  });

  it("returns error when old_string equals new_string", async () => {
    const result = await editTool.execute(
      {
        file_path: join(testDir, "e.ts"),
        old_string: "same",
        new_string: "same",
      },
      { workingDir: testDir },
    );
    expect(result.isError).toBe(true);
    expect(result.output).toContain("identical");
  });

  it("resolves relative path from workingDir", async () => {
    const filePath = join(testDir, "relative.txt");
    await writeFile(filePath, "old content", "utf-8");

    const result = await editTool.execute(
      { file_path: "relative.txt", old_string: "old", new_string: "new" },
      { workingDir: testDir },
    );
    expect(result.isError).toBeUndefined();

    const content = await readFile(filePath, "utf-8");
    expect(content).toBe("new content");
  });

  it("creates new file when old_string is empty", async () => {
    const filePath = join(testDir, "new.txt");

    const result = await editTool.execute(
      { file_path: filePath, old_string: "", new_string: "brand new" },
      { workingDir: testDir },
    );
    expect(result.isError).toBeUndefined();

    const content = await readFile(filePath, "utf-8");
    expect(content).toBe("brand new");
  });

  it("handles line ending normalization", async () => {
    const filePath = join(testDir, "crlf.txt");
    await writeFile(filePath, "line1\r\nline2\r\nline3", "utf-8");

    const result = await editTool.execute(
      { file_path: filePath, old_string: "line2", new_string: "replaced" },
      { workingDir: testDir },
    );
    expect(result.isError).toBeUndefined();

    const content = await readFile(filePath, "utf-8");
    expect(content).toContain("replaced");
    // Should preserve original line endings
    expect(content).toContain("\r\n");
  });

  it("returns isError for empty file_path", async () => {
    const result = await editTool.execute(
      { file_path: "", old_string: "a", new_string: "b" },
      { workingDir: testDir },
    );
    expect(result.isError).toBe(true);
  });
});

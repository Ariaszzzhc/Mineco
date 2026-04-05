import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../../src/skills/frontmatter.js";

describe("parseFrontmatter", () => {
  it("should parse basic frontmatter and content", () => {
    const result = parseFrontmatter(
      "---\nname: test-skill\ndescription: A test skill\n---\n\nDo the thing.",
    );
    expect(result.data).toEqual({
      name: "test-skill",
      description: "A test skill",
    });
    expect(result.content).toBe("Do the thing.");
  });

  it("should return empty data for input without frontmatter", () => {
    const result = parseFrontmatter("Just plain content");
    expect(result.data).toEqual({});
    expect(result.content).toBe("Just plain content");
  });

  it("should handle quoted values with colons", () => {
    const result = parseFrontmatter(
      `---\nname: pdf-skill\ndescription: "Use this when: user asks about PDFs"\n---\n\nProcess.`,
    );
    expect(result.data.description).toBe("Use this when: user asks about PDFs");
  });

  it("should handle single-quoted values", () => {
    const result = parseFrontmatter(
      `---\nname: skill\ndescription: 'Also works: with colons'\n---\n\nContent.`,
    );
    expect(result.data.description).toBe("Also works: with colons");
  });

  it("should skip lines without colon separator", () => {
    const result = parseFrontmatter(
      "---\nname: test\norphan line\ndescription: desc\n---\n\nBody.",
    );
    expect(result.data).toEqual({ name: "test", description: "desc" });
  });

  it("should return empty content when no body after frontmatter", () => {
    const result = parseFrontmatter("---\nname: test\n---");
    expect(result.data).toEqual({ name: "test" });
    expect(result.content).toBe("");
  });

  it("should return empty content and data for unclosed frontmatter", () => {
    const result = parseFrontmatter("---\nname: test\nno closing delimiter");
    expect(result.data).toEqual({});
    expect(result.content).toBe("---\nname: test\nno closing delimiter");
  });

  it("should handle empty frontmatter block", () => {
    const result = parseFrontmatter("---\n---\n\nJust content.");
    expect(result.data).toEqual({});
    expect(result.content).toBe("Just content.");
  });

  it("should handle leading whitespace before opening ---", () => {
    const result = parseFrontmatter("  ---\nname: test\n---\n\nBody.");
    expect(result.data).toEqual({ name: "test" });
    expect(result.content).toBe("Body.");
  });

  it("should trim whitespace from keys and values", () => {
    const result = parseFrontmatter("---\n  name  :  test  \n---\n\nBody.");
    expect(result.data).toEqual({ name: "test" });
  });

  it("should handle value that is just a colon", () => {
    const result = parseFrontmatter("---\nkey: :\n---\n\nBody.");
    expect(result.data).toEqual({ key: ":" });
  });

  it("should handle empty value after colon", () => {
    const result = parseFrontmatter("---\nkey:\n---\n\nBody.");
    expect(result.data).toEqual({ key: "" });
  });

  it("should handle multi-line body content", () => {
    const body = "Line 1\nLine 2\nLine 3";
    const result = parseFrontmatter(`---\nname: test\n---\n\n${body}`);
    expect(result.content).toBe(body);
  });

  it("should handle allowed-tools field with space-separated values", () => {
    const result = parseFrontmatter(
      "---\nname: test\nallowed-tools: bash read write\n---\n\nBody.",
    );
    expect(result.data["allowed-tools"]).toBe("bash read write");
  });
});

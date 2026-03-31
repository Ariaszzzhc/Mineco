import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockParse, mockSanitize, mockCodeToHtml, mockCreateHighlighter } =
  vi.hoisted(() => ({
    mockParse: vi.fn<() => string | Promise<string>>(() => "<p>rendered</p>"),
    mockSanitize: vi.fn((s: string) => s),
    mockCodeToHtml: vi.fn(() => "<pre>highlighted</pre>"),
    mockCreateHighlighter: vi.fn(async () => ({
      codeToHtml: mockCodeToHtml,
    })),
  }));

vi.mock("marked", () => {
  return {
    Marked: class {
      parse = mockParse;
      use = vi.fn();
    },
  };
});

vi.mock("dompurify", () => ({
  default: { sanitize: mockSanitize },
}));

vi.mock("shiki", () => ({
  createHighlighter: mockCreateHighlighter,
}));

// Import after mocks
import { initHighlighter, renderMarkdown } from "../../src/lib/markdown";

describe("renderMarkdown", () => {
  beforeEach(() => {
    mockParse.mockReset();
    mockSanitize.mockReset();
    mockParse.mockReturnValue("<p>rendered</p>");
    mockSanitize.mockImplementation((s: string) => s);
  });

  it("should call marked.parse with content", () => {
    renderMarkdown("# Hello");
    expect(mockParse).toHaveBeenCalledWith("# Hello");
  });

  it("should sanitize output through DOMPurify", () => {
    mockParse.mockReturnValue("<p>test</p>");
    const result = renderMarkdown("test");
    expect(mockSanitize).toHaveBeenCalledWith("<p>test</p>");
    expect(result).toBe("<p>test</p>");
  });

  it("should return string when marked returns string", () => {
    mockParse.mockReturnValue("<p>hello</p>");
    expect(renderMarkdown("hello")).toBe("<p>hello</p>");
  });

  it("should return empty string when marked returns non-string", () => {
    mockParse.mockReturnValue(Promise.resolve("<p>async</p>"));
    const result = renderMarkdown("hello");
    expect(result).toBe("");
  });
});

describe("initHighlighter", () => {
  beforeEach(() => {
    mockCreateHighlighter.mockReset();
    mockCreateHighlighter.mockResolvedValue({
      codeToHtml: mockCodeToHtml,
    });
  });

  it("should call createHighlighter", () => {
    initHighlighter();
    expect(mockCreateHighlighter).toHaveBeenCalled();
  });

  it("should cache highlighter promise (second call returns same)", async () => {
    // The module caches highlighterPromise at module level.
    // Since other tests may have already called initHighlighter,
    // we verify the caching behavior by checking call count.
    const callCount = mockCreateHighlighter.mock.calls.length;
    initHighlighter();
    initHighlighter();
    // Should not have added more calls since promise is cached
    // (or only 1 new call if this is the first invocation)
    expect(mockCreateHighlighter.mock.calls.length).toBeLessThanOrEqual(
      callCount + 1,
    );
  });
});

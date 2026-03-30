import { Marked } from "marked";
import DOMPurify from "dompurify";
import {
  createHighlighter,
  type Highlighter,
  type BundledLanguage,
} from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-light"],
      langs: [
        "typescript",
        "javascript",
        "python",
        "rust",
        "go",
        "json",
        "html",
        "css",
        "bash",
        "markdown",
        "yaml",
        "tsx",
        "jsx",
        "sql",
        "shell",
      ],
    });
  }
  return highlighterPromise;
}

const marked = new Marked({
  gfm: true,
  async: false,
});

marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = (lang ?? "text") as BundledLanguage;

      // Try synchronous highlight with cached highlighter
      try {
        const hl = getCachedHighlighter();
        if (hl) {
          const html = hl.codeToHtml(text, {
            lang: language,
            theme: "github-light",
          });
          return html;
        }
      } catch {
        // Fallback to plain code block
      }

      return `<pre><code class="language-${language}">${escapeHtml(text)}</code></pre>`;
    },
  },
});

let cachedHighlighter: Highlighter | null = null;

function getCachedHighlighter(): Highlighter | null {
  return cachedHighlighter;
}

// Initialize highlighter in background
export function initHighlighter(): void {
  getHighlighter().then((hl) => {
    cachedHighlighter = hl;
  });
}

export function renderMarkdown(content: string): string {
  const result = marked.parse(content);
  const raw = typeof result === "string" ? result : "";
  return DOMPurify.sanitize(raw);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  content: string;
}

/**
 * Parse YAML-like frontmatter from a string.
 *
 * Supports the `---` delimited format used in markdown skill files.
 * Values are trimmed; quoted strings have their quotes stripped.
 * Lines without a `:` separator are skipped.
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const trimmed = raw.trimStart();

  if (!trimmed.startsWith("---")) {
    return { data: {}, content: trimmed };
  }

  // Find closing ---
  // Start search after the opening --- (skip the first line)
  const firstNewline = trimmed.indexOf("\n");
  if (firstNewline === -1) {
    return { data: {}, content: "" };
  }

  const rest = trimmed.slice(firstNewline + 1);
  const closingMatch = rest.match(/^---(?=\n)|\n---/);

  if (!closingMatch) {
    // No closing --- found — treat entire input as content
    return { data: {}, content: trimmed };
  }

  const closingIndex = closingMatch.index as number;
  const frontmatterBlock = rest.slice(0, closingIndex);
  const contentStart = rest.slice(closingIndex + 4).trimStart(); // skip \n---

  const data: Record<string, unknown> = {};

  for (const line of frontmatterBlock.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value: string = line.slice(colonIndex + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    data[key] = value;
  }

  return { data, content: contentStart };
}

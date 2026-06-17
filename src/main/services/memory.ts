/**
 * Memory service (EDD §8.2, M3).
 *
 * Per-workspace long-term memory lives in markdown files:
 *
 *   Workspace:  `<workspaceRoot>/.mineco/memory/<slug>.md`
 *               `<workspaceRoot>/.mineco/memory/MEMORY.md`  (index)
 *   Public:     `~/.mineco/memory/<slug>.md`
 *               `~/.mineco/memory/MEMORY.md`               (index)
 *
 * Each `<slug>.md` has YAML frontmatter:
 * ```yaml
 * ---
 * name: Title of the memory
 * description: One-line hook for the index
 * metadata:
 *   type: user | feedback | project | reference
 * ---
 *
 * Body markdown…
 * ```
 *
 * `MEMORY.md` index format (one entry per line):
 * ```markdown
 * - [Title](slug.md) — hook
 * ```
 *
 * `assembleMemoryBlock(workspaceId)` reads the enabled entries, applies a
 * budget cap (≤ 12 entries), and returns an appendable text block (or "").
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { MemoryEntry } from "@/shared/agent-protocol";
import { getWorkspacePaths } from "./workspace-paths";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** Returns the memory directory for a workspace, or the public one when null. */
export async function dirFor(workspaceId: string | null): Promise<string> {
  if (!workspaceId) {
    return path.join(os.homedir(), ".mineco", "memory");
  }
  const { rootPath } = await getWorkspacePaths(workspaceId);
  if (rootPath) {
    return path.join(rootPath, ".mineco", "memory");
  }
  return path.join(os.homedir(), ".mineco", "memory");
}

const INDEX_FILE = "MEMORY.md";

function indexPath(memDir: string): string {
  return path.join(memDir, INDEX_FILE);
}

function slugPath(memDir: string, slug: string): string {
  return path.join(memDir, `${slug}.md`);
}

// ---------------------------------------------------------------------------
// YAML frontmatter parser (minimal — no external dep)
// ---------------------------------------------------------------------------

interface MemoryFrontMatter {
  name?: string;
  description?: string;
  metadata?: { type?: MemoryEntry["type"] };
}

function parseFrontMatter(content: string): {
  fm: MemoryFrontMatter;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { fm: {}, body: content };
  const block = match[1];
  const body = match[2].trim();
  const fm: MemoryFrontMatter = {};
  let inMetadata = false;
  for (const line of block.split(/\r?\n/)) {
    if (line.trim() === "metadata:") {
      inMetadata = true;
      continue;
    }
    if (inMetadata && line.startsWith("  ")) {
      const colon = line.indexOf(":");
      if (colon !== -1) {
        const key = line.slice(0, colon).trim();
        const value = line
          .slice(colon + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
        if (key === "type") {
          fm.metadata = { type: value as MemoryEntry["type"] };
        }
      }
      continue;
    }
    inMetadata = false;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line
      .slice(colon + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key === "name") fm.name = value;
    if (key === "description") fm.description = value;
  }
  return { fm, body };
}

function entryToMarkdown(entry: MemoryEntry): string {
  return [
    "---",
    `name: ${entry.title}`,
    `description: ${entry.description}`,
    "metadata:",
    `  type: ${entry.type}`,
    "---",
    "",
    entry.body,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Index helpers
// ---------------------------------------------------------------------------

/** Reads the MEMORY.md index and returns slug order (for sorting). */
async function readIndex(memDir: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(indexPath(memDir), "utf8");
    const slugs: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/\[.*?\]\((.+?)\.md\)/);
      if (m) slugs.push(m[1]);
    }
    return slugs;
  } catch {
    return [];
  }
}

/** Rewrites the MEMORY.md index from the current entries list. */
async function rebuildIndex(
  memDir: string,
  entries: MemoryEntry[],
): Promise<void> {
  const lines = entries.map(
    (e) => `- [${e.title}](${e.slug}.md) — ${e.description}`,
  );
  await fs.mkdir(memDir, { recursive: true });
  await fs.writeFile(
    indexPath(memDir),
    `# Memory Index\n\n${lines.join("\n")}\n`,
    "utf8",
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Lists all memory entries for a workspace (or the public memory when
 * `workspaceId` is null).
 *
 * Reads the MEMORY.md index to preserve user ordering, then reads each
 * `<slug>.md` file. Unreadable files are silently skipped.
 */
export async function listMemory(
  workspaceId: string | null,
): Promise<MemoryEntry[]> {
  const memDir = await dirFor(workspaceId);
  const indexSlugs = await readIndex(memDir);

  // Also pick up files not in the index.
  let allSlugs: string[] = [];
  try {
    const dirents = await fs.readdir(memDir, { withFileTypes: true });
    allSlugs = dirents
      .filter(
        (d) => d.isFile() && d.name.endsWith(".md") && d.name !== INDEX_FILE,
      )
      .map((d) => d.name.replace(/\.md$/, ""));
  } catch {
    return [];
  }

  // Merge index order + any orphaned files.
  const ordered = [
    ...indexSlugs.filter((s) => allSlugs.includes(s)),
    ...allSlugs.filter((s) => !indexSlugs.includes(s)),
  ];

  const entries: MemoryEntry[] = [];
  for (const slug of ordered) {
    try {
      const content = await fs.readFile(slugPath(memDir, slug), "utf8");
      const { fm, body } = parseFrontMatter(content);
      entries.push({
        slug,
        title: fm.name ?? slug,
        description: fm.description ?? "",
        type: fm.metadata?.type ?? "reference",
        body,
      });
    } catch {
      // Skip unreadable entries.
    }
  }
  return entries;
}

/**
 * Creates a new memory entry file (`<slug>.md`) and updates the MEMORY.md
 * index. The slug is derived from the title.
 */
export async function createMemory(
  workspaceId: string | null,
  entry: Omit<MemoryEntry, "slug">,
): Promise<MemoryEntry> {
  const memDir = await dirFor(workspaceId);
  await fs.mkdir(memDir, { recursive: true });

  const baseSlug =
    entry.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || randomUUID().slice(0, 8);

  // Make the slug unique.
  let slug = baseSlug;
  let attempt = 0;
  while (true) {
    try {
      await fs.access(slugPath(memDir, slug));
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    } catch {
      break; // File does not exist — slug is free.
    }
  }

  const newEntry: MemoryEntry = { ...entry, slug };
  await fs.writeFile(slugPath(memDir, slug), entryToMarkdown(newEntry), "utf8");

  // Rebuild index.
  const existing = await listMemory(workspaceId);
  await rebuildIndex(memDir, [
    ...existing.filter((e) => e.slug !== slug),
    newEntry,
  ]);

  return newEntry;
}

/**
 * Updates an existing memory entry (identified by `slug`). Rewrites the file
 * and rebuilds the index with the new title/description.
 */
export async function updateMemory(
  workspaceId: string | null,
  entry: MemoryEntry,
): Promise<void> {
  const memDir = await dirFor(workspaceId);
  await fs.writeFile(
    slugPath(memDir, entry.slug),
    entryToMarkdown(entry),
    "utf8",
  );

  const existing = await listMemory(workspaceId);
  const merged = existing.map((e) => (e.slug === entry.slug ? entry : e));
  await rebuildIndex(memDir, merged);
}

/**
 * Deletes a memory entry file and removes it from the MEMORY.md index.
 */
export async function deleteMemory(
  workspaceId: string | null,
  slug: string,
): Promise<void> {
  const memDir = await dirFor(workspaceId);
  try {
    await fs.unlink(slugPath(memDir, slug));
  } catch {
    // Already gone — continue to index cleanup.
  }
  const existing = await listMemory(workspaceId);
  await rebuildIndex(
    memDir,
    existing.filter((e) => e.slug !== slug),
  );
}

/**
 * Assembles a budget-capped (≤ 12 entries) text block from the workspace
 * memory, suitable for appending to the system prompt.
 *
 * Returns an empty string when there are no entries.
 */
export async function assembleMemoryBlock(
  workspaceId: string | null,
): Promise<string> {
  const entries = await listMemory(workspaceId);
  if (!entries.length) return "";

  const capped = entries.slice(0, 12);
  const lines: string[] = ["## Long-term Memory", ""];
  for (const e of capped) {
    lines.push(`### ${e.title}`);
    if (e.description) lines.push(`> ${e.description}`, "");
    lines.push(e.body, "");
  }
  return lines.join("\n");
}

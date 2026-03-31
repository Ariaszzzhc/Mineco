import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { browseFsSchema } from "../config/schema.js";

interface DirEntry {
  name: string;
  path: string;
}

interface BrowseResult {
  currentPath: string;
  parentPath: string | null;
  directories: DirEntry[];
}

export function createFsRoutes() {
  return new Hono().get(
    "/browse",
    zValidator("query", browseFsSchema),
    async (c) => {
      const { path: rawPath } = c.req.valid("query");
      const dirPath = rawPath || homedir();

      // Normalize and validate
      let resolved: string;
      try {
        resolved = resolveDirPath(dirPath);
      } catch {
        return c.json({ error: "Invalid path" }, 400);
      }

      // Check accessible
      let entries: string[];
      try {
        entries = readdirSync(resolved);
      } catch {
        return c.json({ error: "Cannot read directory" }, 403);
      }

      const directories: DirEntry[] = [];
      for (const entry of entries) {
        const fullPath = join(resolved, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            directories.push({ name: entry, path: fullPath });
          }
        } catch {
          // Skip entries we can't stat
        }
      }

      // Sort alphabetically, case-insensitive
      directories.sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
      );

      const root = getRootPath();
      const parentPath = resolved === root ? null : dirname(resolved);

      const result: BrowseResult = {
        currentPath: resolved,
        parentPath,
        directories,
      };

      return c.json(result);
    },
  );
}

function resolveDirPath(p: string): string {
  // Expand ~ to home directory
  if (p.startsWith("~")) {
    p = homedir() + p.slice(1);
  }
  // Use Node's path.resolve to normalize
  return p;
}

function getRootPath(): string {
  return sep === "/"
    ? "/"
    : (process.env.SystemDrive?.replace("\\", "/") ?? "C:/");
}

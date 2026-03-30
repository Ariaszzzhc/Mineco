import { Hono } from "hono";
import { readdirSync, statSync } from "node:fs";
import { join, dirname, sep } from "node:path";
import { homedir } from "node:os";

interface DirEntry {
  name: string;
  path: string;
}

interface BrowseResult {
  currentPath: string;
  parentPath: string | null;
  directories: DirEntry[];
}

export function createFsRoutes(): Hono {
  const app = new Hono();

  app.get("/browse", async (c) => {
    const rawPath = c.req.query("path");
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
    directories.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    const root = getRootPath();
    const parentPath = resolved === root ? null : dirname(resolved);

    const result: BrowseResult = {
      currentPath: resolved,
      parentPath,
      directories,
    };

    return c.json(result);
  });

  return app;
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
  return sep === "/" ? "/" : process.env.SystemDrive?.replace("\\", "/") ?? "C:/";
}

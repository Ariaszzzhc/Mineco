/**
 * Thin helper that resolves a workspace ID to its filesystem paths.
 * Used internally by mcp.ts / skills.ts / memory.ts to avoid importing the
 * full workspace service (which re-exports DB functions and avoids circular deps).
 */

import { getWorkspace } from "@/main/db/workspaces";

export interface WorkspacePaths {
  rootPath: string | null;
}

/**
 * Returns the `rootPath` for a workspace DB row. Returns `{ rootPath: null }`
 * when the workspace is not found (tolerant — callers fall back to global scope).
 */
export async function getWorkspacePaths(
  workspaceId: string,
): Promise<WorkspacePaths> {
  try {
    const ws = await getWorkspace(workspaceId);
    return { rootPath: ws?.rootPath ?? null };
  } catch {
    return { rootPath: null };
  }
}

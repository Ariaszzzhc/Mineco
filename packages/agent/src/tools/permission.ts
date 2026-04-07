import { randomUUID } from "node:crypto";
import * as path from "node:path";

export type ToolRisk = "read" | "write" | "execute";

export interface PermissionRequest {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  riskLevel: ToolRisk;
  reason: string;
}

export type PermissionDecision = "allow" | "deny";

const TOOL_RISK: Record<string, ToolRisk> = {
  read_file: "read",
  grep: "read",
  glob: "read",
  ls: "read",
  write_file: "write",
  edit: "write",
  bash: "execute",
};

function isWithinWorkspace(filePath: string, workingDir: string): boolean {
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.join(workingDir, filePath);
  const normalized = path.normalize(resolved);
  const normalizedDir = path.normalize(workingDir);
  // Use trailing separator to prevent substring match
  // e.g. /home/user/app should not match /home/user/application
  return (
    normalized === normalizedDir ||
    normalized.startsWith(normalizedDir + path.sep)
  );
}

function extractPath(
  toolName: string,
  args: Record<string, unknown>,
): string | null {
  if (
    toolName === "read_file" ||
    toolName === "write_file" ||
    toolName === "edit"
  ) {
    const fp = args.file_path;
    return typeof fp === "string" ? fp : null;
  }
  // grep, glob, ls use "path" for the directory to search
  if (toolName === "grep" || toolName === "glob" || toolName === "ls") {
    const p = args.path;
    return typeof p === "string" ? p : null;
  }
  return null;
}

export function checkPermission(
  toolName: string,
  argsJson: string,
  workingDir: string,
): PermissionRequest | null {
  const risk = TOOL_RISK[toolName];
  if (!risk) return null;

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(argsJson);
  } catch {
    return null;
  }

  if (risk === "execute") {
    const command = typeof args.command === "string" ? args.command : "";
    return {
      id: randomUUID(),
      toolName,
      args,
      riskLevel: "execute",
      reason: `Shell command requires confirmation: ${command.slice(0, 200)}`,
    };
  }

  const filePath = extractPath(toolName, args);
  if (filePath && !isWithinWorkspace(filePath, workingDir)) {
    return {
      id: randomUUID(),
      toolName,
      args,
      riskLevel: risk,
      reason: `${risk === "read" ? "Reading" : "Writing"} outside workspace: ${filePath}`,
    };
  }

  return null;
}

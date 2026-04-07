import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

function runGit(
  args: string[],
  cwd: string,
  timeout = 10_000,
): Promise<{ stdout: string; stderr: string }> {
  const command = ["git", ...args].join(" ");
  return new Promise((resolve, reject) => {
    exec(
      command,
      { cwd, timeout, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      },
    );
  });
}

export async function isGitRepo(dirPath: string): Promise<boolean> {
  // .git can be a directory (main repo) or a file (worktree/submodule)
  const gitPath = join(dirPath, ".git");
  return existsSync(gitPath);
}

export async function getGitRoot(dirPath: string): Promise<string | null> {
  try {
    const { stdout } = await runGit(["rev-parse", "--show-toplevel"], dirPath);
    return stdout || null;
  } catch {
    return null;
  }
}

export async function getCurrentBranch(
  dirPath: string,
): Promise<string | null> {
  try {
    const { stdout } = await runGit(
      ["rev-parse", "--abbrev-ref", "HEAD"],
      dirPath,
    );
    return stdout || null;
  } catch {
    return null;
  }
}

export async function hasUncommittedChanges(dirPath: string): Promise<boolean> {
  try {
    const { stdout } = await runGit(["status", "--porcelain"], dirPath);
    return stdout.length > 0;
  } catch {
    return false;
  }
}

export async function branchExists(
  gitRoot: string,
  branchName: string,
): Promise<boolean> {
  try {
    const { stdout } = await runGit(["branch", "--list", branchName], gitRoot);
    return stdout.length > 0;
  } catch {
    return false;
  }
}

export async function listLocalBranches(gitRoot: string): Promise<string[]> {
  try {
    const { stdout } = await runGit(["branch", "--list"], gitRoot);
    return stdout
      .split("\n")
      .map((line) => line.replace(/^\*?\s+/, "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export { runGit };

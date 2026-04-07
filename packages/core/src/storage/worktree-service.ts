import { randomUUID } from "node:crypto";
import { appendFile, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  branchExists,
  hasUncommittedChanges,
  isGitRepo,
  runGit,
} from "../lib/git.js";

const appendFileAsync = promisify(appendFile);

export interface WorktreeInfo {
  path: string;
  branch: string;
}

export class WorktreeService {
  /**
   * Create a git worktree for a session.
   * Worktrees are stored at {gitRoot}/.mineco/worktrees/{sessionId}/
   */
  async createWorktree(
    gitRoot: string,
    sessionId: string,
    branchName?: string,
  ): Promise<WorktreeInfo> {
    const branch = branchName ?? (await this.generateBranchName(gitRoot));

    // Ensure .mineco/ is in .gitignore
    await this.ensureGitignore(gitRoot);

    const worktreeDir = join(gitRoot, ".mineco", "worktrees", sessionId);

    // Create the worktree with a new branch from HEAD
    await runGit(["worktree", "add", worktreeDir, "-b", branch], gitRoot);

    return { path: worktreeDir, branch };
  }

  /**
   * Remove a git worktree and its associated branch.
   */
  async deleteWorktree(worktreePath: string): Promise<void> {
    await runGit(["worktree", "remove", "--force", worktreePath], worktreePath);
  }

  /**
   * Check if a worktree has uncommitted changes.
   */
  async checkUncommittedChanges(worktreePath: string): Promise<boolean> {
    return hasUncommittedChanges(worktreePath);
  }

  /**
   * Generate a unique branch name: mineco/session-{short-id}
   */
  async generateBranchName(gitRoot: string): Promise<string> {
    let attempts = 0;
    while (attempts < 10) {
      const shortId = randomUUID().slice(0, 8);
      const name = `mineco/session-${shortId}`;
      if (!(await branchExists(gitRoot, name))) {
        return name;
      }
      attempts++;
    }
    // Fallback with full UUID if short collisions persist
    return `mineco/session-${randomUUID()}`;
  }

  /**
   * Check if a directory is inside a git repo and return worktree-safe info.
   */
  async getWorktreeInfo(
    dirPath: string,
  ): Promise<{ isGitRepo: boolean; gitRoot: string | null }> {
    const isRepo = await isGitRepo(dirPath);
    if (!isRepo) {
      return { isGitRepo: false, gitRoot: null };
    }

    // runGit needs the git root; if dirPath is already the root, it works
    try {
      const { stdout } = await runGit(
        ["rev-parse", "--show-toplevel"],
        dirPath,
      );
      return { isGitRepo: true, gitRoot: stdout };
    } catch {
      return { isGitRepo: true, gitRoot: dirPath };
    }
  }

  /**
   * Ensure .mineco/ is listed in the project's .gitignore.
   */
  private async ensureGitignore(gitRoot: string): Promise<void> {
    const gitignorePath = join(gitRoot, ".gitignore");
    const entry = ".mineco/\n";

    if (!existsSync(gitignorePath)) {
      await appendFileAsync(gitignorePath, entry);
      return;
    }

    // Check if already present
    const content = readFileSync(gitignorePath, "utf-8");
    if (!content.includes(".mineco/")) {
      const prefix = content.endsWith("\n") ? "" : "\n";
      await appendFileAsync(gitignorePath, `${prefix}${entry}`);
    }
  }
}

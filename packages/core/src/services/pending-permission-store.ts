import type { PermissionDecision } from "@mineco/agent";

interface PendingEntry {
  resolve: (decision: PermissionDecision) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export class PendingPermissionStore {
  private pending = new Map<string, PendingEntry>();

  set(
    requestId: string,
    resolve: (decision: PermissionDecision) => void,
    reject: (reason: Error) => void,
  ): void {
    const timer = setTimeout(() => {
      if (this.pending.has(requestId)) {
        this.pending.delete(requestId);
        reject(new Error("Permission request timed out"));
      }
    }, TIMEOUT_MS);

    this.pending.set(requestId, { resolve, reject, timer });
  }

  resolve(requestId: string, decision: PermissionDecision): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;

    clearTimeout(entry.timer);
    this.pending.delete(requestId);
    entry.resolve(decision);
    return true;
  }

  cleanup(requestId: string): void {
    const entry = this.pending.get(requestId);
    if (entry) {
      clearTimeout(entry.timer);
      this.pending.delete(requestId);
    }
  }

  has(requestId: string): boolean {
    return this.pending.has(requestId);
  }
}

/**
 * Permission gate (§4.3, §5.5).
 *
 * The SDK's `canUseTool` callback fires in the child while a session is
 * running. Core translates it into:
 *   1. a `session/permissionRequest` notification to the UI (keyed by
 *      `toolUseID`), and
 *   2. a Promise parked on that same `toolUseID`.
 *
 * `session/respondPermission` resolves that Promise with the user's decision.
 * Core enforces its OWN timeout (default deny) so a stuck child never waits
 * forever (§4.3).
 */
import { type PermissionBehavior } from '@/protocol';

export interface PermissionDecision {
  behavior: PermissionBehavior;
  /** Persisted rule updates when the user chose "always". */
  updatedPermissions?: unknown;
  message?: string;
}

type Resolver = (decision: PermissionDecision) => void;

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 min, then auto-deny (§4.3)

/**
 * Per-session map of pending permission promises keyed by `toolUseID`.
 * The session owns one; the manager resolves across sessions.
 */
export class PermissionGate {
  private pending = new Map<string, { resolve: Resolver; timer: number }>();

  /** Park a permission request. Resolves on respond or timeout (deny). */
  request(toolUseId: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<PermissionDecision> {
    this.cancel(toolUseId); // overwrite any stale entry
    return new Promise<PermissionDecision>((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(toolUseId)) {
          resolve({ behavior: 'deny', message: 'permission request timed out' });
        }
      }, timeoutMs);
      this.pending.set(toolUseId, {
        resolve: (d) => {
          clearTimeout(timer);
          resolve(d);
        },
        timer,
      });
    });
  }

  /** Resolve a pending request with the user's decision. Returns false if unknown/stale. */
  respond(toolUseId: string, decision: PermissionDecision): boolean {
    const entry = this.pending.get(toolUseId);
    if (!entry) return false;
    this.pending.delete(toolUseId);
    clearTimeout(entry.timer);
    entry.resolve(decision);
    return true;
  }

  /** Cancel a pending request, resolving it with a deny decision (e.g. session closed). */
  cancel(toolUseId: string): void {
    const entry = this.pending.get(toolUseId);
    if (!entry) return;
    this.pending.delete(toolUseId);
    clearTimeout(entry.timer);
    entry.resolve({ behavior: 'deny', message: 'session closed' });
  }

  clear(): void {
    for (const id of [...this.pending.keys()]) this.cancel(id);
  }
}

/**
 * Scope resolver — pure function, no I/O (EDD §7.2).
 *
 * Merges three scope layers (global / project / local) into a flat list with:
 *   - Priority: local > project > global (highest wins for same-named entries)
 *   - Shadowed lower-priority entries marked `overridden: true`
 *   - Entries whose name is in `disabled` filtered out (but still present with
 *     `enabled: false` so the UI can show toggled-off items and still mark
 *     overrides correctly)
 *
 * Used by both MCP (`McpServerEntry`) and Skills (`SkillEntry`) — any object
 * with a string `name` and a `scope` field works.
 *
 * This module is intentionally I/O-free so it can be unit-tested without stubs.
 */

/** The three scope levels mineco recognises. */
export type Scope = "global" | "project" | "local";

/** Minimum shape required of items passed to {@link resolveScoped}. */
type Scopable = { name: string; scope: Scope };

/**
 * Merges `global`, `project`, and `local` arrays into a single flat list.
 *
 * - Within a scope, entries are kept as-is.
 * - When two scopes have an entry with the same `name`, the lower-priority one
 *   gets `overridden: true` and is still included (so the UI can render a
 *   "shadowed by local" badge), but its `enabled` flag is forced to `false`.
 * - Entries whose `name` appears in `disabled` have their `enabled` flag set to
 *   `false` (they remain in the list so the UI can show the toggle-off state).
 *
 * Priority order (highest first): local → project → global.
 */
export function resolveScoped<
  T extends Scopable & { enabled: boolean; overridden?: boolean },
>(global: T[], project: T[], local: T[], disabled: Set<string>): T[] {
  // Layer priority: local (2) > project (1) > global (0).
  const PRIORITY: Record<Scope, number> = { local: 2, project: 1, global: 0 };

  // Build a map from name -> highest-priority scope that defines it.
  const winningScope = new Map<string, Scope>();
  for (const items of [global, project, local]) {
    for (const item of items) {
      const current = winningScope.get(item.name);
      if (current === undefined || PRIORITY[item.scope] > PRIORITY[current]) {
        winningScope.set(item.name, item.scope);
      }
    }
  }

  const result: T[] = [];
  for (const items of [global, project, local]) {
    for (const item of items) {
      const winner = winningScope.get(item.name) ?? item.scope;
      const isOverridden = PRIORITY[item.scope] < PRIORITY[winner];
      const isDisabled = disabled.has(item.name);
      result.push({
        ...item,
        enabled: !isOverridden && !isDisabled,
        overridden: isOverridden || undefined,
      });
    }
  }

  return result;
}

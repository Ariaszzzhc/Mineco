// SPDX-License-Identifier: MIT
/**
 * Migration registry — the ordered list applied by `migrate()` (§5).
 *
 * Add new numbered migrations to this array in id order. The migrator applies
 * only those not yet recorded in `schema_migrations`.
 */
import type { Migration } from '../migrator.ts';
import init from './0001_init.ts';

export const migrations: Migration[] = [init];

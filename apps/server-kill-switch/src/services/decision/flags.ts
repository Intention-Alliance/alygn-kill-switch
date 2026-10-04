/**
 * Decision flags reader (server side) — S3.
 *
 * Resolves `decision.*` flags for a machine with the same semantics as
 * GET /v1/machines/:id/flags: machine override > global > declared default.
 *
 * Never throws: an unreadable/unparseable value falls back to the declared
 * default, because a flag read failure must not become a fail-open path.
 */

import { and, eq } from 'drizzle-orm';
import type { DecisionFlagReader } from '@align/shared-types';
import { db } from '../../db/index';
import { featureFlags, machineFlags } from '../../db/schema';
import { getFlagDefinition } from '../../db/flag-definitions';

const DECISION_KEYS = [
  'decision.provider',
  'decision.jev.model',
  'decision.jev.timeoutMs',
  'decision.review_threshold',
] as const;

export async function readDecisionFlags(machineId: string): Promise<DecisionFlagReader> {
  const resolved = new Map<string, boolean | number | string | null>();

  for (const key of DECISION_KEYS) {
    const def = getFlagDefinition(key);
    let value: string | null = null;

    try {
      // 1. machine override wins
      const override = await db
        .select()
        .from(machineFlags)
        .where(and(eq(machineFlags.machineId, machineId), eq(machineFlags.flagKey, key)))
        .get();
      if (override && override.value !== null && override.value !== undefined) {
        value = String(override.value);
      } else {
        // 2. global row
        const global = await db.select().from(featureFlags).where(eq(featureFlags.key, key)).get();
        if (global && global.value !== null && global.value !== undefined) {
          value = String(global.value);
        }
      }
    } catch {
      value = null; // never throw — fall through to the declared default
    }

    // 3. declared default
    if (value === null || value === undefined) {
      resolved.set(key, def?.defaultValue ?? null);
      continue;
    }

    if (def) {
      if (def.type === 'number') {
        const n = Number(value);
        resolved.set(key, Number.isFinite(n) ? n : def.defaultValue);
      } else if (def.type === 'boolean') {
        resolved.set(key, value === 'true' || value === '1');
      } else {
        resolved.set(key, value);
      }
    } else {
      resolved.set(key, value);
    }
  }

  return {
    getFlag: (key: string) => (resolved.has(key) ? resolved.get(key)! : null),
  };
}

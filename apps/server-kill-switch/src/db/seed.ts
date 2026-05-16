/**
 * Database Seed Module — Default Data Initialization
 *
 * Seeds the default machine (andlersrv) and 6 default settings
 * on first startup. All operations are idempotent (safe to re-run).
 *
 * ADR-133: Kill Switch dashboard rebuild — machine + settings seeding.
 */

import { eq } from 'drizzle-orm';
import { db } from './index';
import { machines, settings } from './schema';

/**
 * Seed the default machine (andlersrv) if it doesn't exist.
 * Uses INSERT OR IGNORE semantics — won't overwrite existing data.
 */
export async function seedDefaults() {
  // ─── Seed default machine ─────────────────────────────────────────
  const existingMachine = await db
    .select()
    .from(machines)
    .where(eq(machines.id, 'machine-andlersrv-001'))
    .get();

  if (!existingMachine) {
    await db.insert(machines).values({
      id: 'machine-andlersrv-001',
      name: 'andlersrv',
      hostname: 'andlersrv.tail62d797.ts.net',
      status: 'active',
      role: 'Primary Controller',
      hasDpu: false,
      specs: JSON.stringify({
        cpu: 'AMD Ryzen 9',
        ram: '64GB',
        gpu: 'NVIDIA RTX 4090',
        dpu: null,
      }),
      lastSeen: new Date(),
    });
    console.log('[seed] Default machine "andlersrv" created');
  }

  // ─── Seed default settings ────────────────────────────────────────
  const defaultSettings = [
    { key: 'auto_poll_interval', value: '5000' },
    { key: 'enable_notifications', value: 'true' },
    { key: 'audit_log_retention_days', value: '30' },
    { key: 'session_timeout_minutes', value: '60' },
    { key: 'ip_allowlist_enabled', value: 'false' },
    { key: 'rate_limit_per_minute', value: '100' },
  ];

  let seeded = 0;
  for (const s of defaultSettings) {
    const existingSetting = await db
      .select()
      .from(settings)
      .where(eq(settings.key, s.key))
      .get();

    if (!existingSetting) {
      await db.insert(settings).values(s);
      seeded++;
    }
  }

  if (seeded > 0) {
    console.log(`[seed] ${seeded} default settings created`);
  }

  console.log('[seed] Seed complete');
}

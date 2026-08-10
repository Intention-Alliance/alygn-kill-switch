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
import { machines, settings, featureFlags } from './schema';

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
      // ADR-138: the main tenant (kill-switch admin host) is the controller,
      // not a managed machine — it is never monitoring-only.
      monitoringOnly: false,
      zone: 'control-plane',
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

/**
 * Seed the 5 predefined feature flags (ADR-133 Q5) on first startup.
 * All operations are idempotent (safe to re-run).
 */
export async function seedFeatureFlags() {
  const predefinedFlags = [
    {
      id: 'flag-interception-enabled',
      key: 'interception_enabled',
      value: true,
      description: 'Master kill switch for LLM request interception',
      enabled: true,
      createdBy: 'system',
    },
    {
      id: 'flag-auto-stop-threshold',
      key: 'auto_stop_threshold',
      value: true,
      description: 'Semantic score threshold for auto-stop (default: 0.85)',
      enabled: true,
      createdBy: 'system',
    },
    {
      id: 'flag-damage-logging-level',
      key: 'damage_logging_level',
      value: true,
      description: 'Log level for damage events (default: warning)',
      enabled: true,
      createdBy: 'system',
    },
    {
      id: 'flag-alert-on-critical',
      key: 'alert_on_critical_score',
      value: true,
      description: 'Emit alert when score exceeds threshold',
      enabled: true,
      createdBy: 'system',
    },
    {
      id: 'flag-sampling-rate',
      key: 'sampling_rate',
      value: true,
      description: 'Fraction of requests to evaluate (0-1, default: 1.0)',
      enabled: true,
      createdBy: 'system',
    },
  ];

  let seeded = 0;
  for (const flag of predefinedFlags) {
    const existing = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.key, flag.key))
      .get();

    if (!existing) {
      await db.insert(featureFlags).values(flag);
      seeded++;
    }
  }

  if (seeded > 0) {
    console.log(`[seed] ${seeded} feature flags created`);
  }
}

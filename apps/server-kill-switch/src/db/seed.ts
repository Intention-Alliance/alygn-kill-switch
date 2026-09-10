/**
 * Database Seed Module — Default Data Initialization
 *
 * Seeds the default machine and default settings on first startup.
 * All operations are idempotent (safe to re-run).
 *
 * ADR-133: Kill Switch dashboard rebuild — machine + settings seeding.
 * v1.2: feature flags now seed from the single source of truth
 * (db/flag-definitions.ts) and RECONCILE existing rows by key instead of
 * colliding on hardcoded ids (fixes F1: "UNIQUE constraint failed:
 * feature_flag.id" on re-seed against an existing database).
 */

import { eq, and } from 'drizzle-orm';
import { db } from './index';
import { machines, settings, featureFlags, machineFlags } from './schema';
import { PREDEFINED_FLAG_DEFINITIONS, LEGACY_FLAG_KEY_MAP, stableFlagId } from './flag-definitions';

/**
 * Seed the default machine if it doesn't exist.
 * Uses INSERT OR IGNORE semantics — won't overwrite existing data.
 */
export async function seedDefaults() {
  // ─── Seed default machine ─────────────────────────────────────────
  const existingMachine = await db
    .select()
    .from(machines)
    .where(eq(machines.hostname, process.env.ALYGN_MACHINE_HOSTNAME ?? 'localhost'))
    .get();

  if (!existingMachine) {
    await db.insert(machines).values({
      id: `machine-${(process.env.ALYGN_MACHINE_HOSTNAME ?? 'localhost').split('.')[0]}`,
      name: process.env.ALYGN_MACHINE_NAME ?? (process.env.ALYGN_MACHINE_HOSTNAME ?? 'localhost').split('.')[0],
      hostname: process.env.ALYGN_MACHINE_HOSTNAME ?? 'localhost',
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
    console.log('[seed] Default machine created');
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
 * Seed the predefined feature flags (ADR-133 Q5 + ADR-136/137) from the
 * single source of truth. Idempotent and collision-free:
 *
 *   1. Rename legacy keys (interception_enabled → llm_interception_enabled,
 *      sampling_rate → request_sampling_rate) so the UI, overrides and
 *      merged view all agree. Legacy rows keep their id, value and audit
 *      history; only the key is updated (and any machine_flag rows that
 *      reference the old key are migrated too).
 *   2. Insert any missing predefined flag by its STABLE id derived from the
 *      key (never a hardcoded id that can collide with an existing row).
 *   3. Never overwrite existing values — the seed is a baseline, not a reset.
 */
export async function seedFeatureFlags() {
  // ─── 1. Reconcile legacy keys ─────────────────────────────────────
  for (const [legacyKey, canonicalKey] of Object.entries(LEGACY_FLAG_KEY_MAP)) {
    const legacyRow = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.key, legacyKey))
      .get();
    if (!legacyRow) continue;

    const canonicalRow = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.key, canonicalKey))
      .get();

    if (canonicalRow) {
      // Both exist: drop the legacy row (overrides/audit reference the key;
      // the canonical row is the survivor). machine_flag rows pointing at
      // the legacy key are repointed to the canonical key.
      await db.delete(featureFlags).where(eq(featureFlags.key, legacyKey)).run();
      console.log(`[seed] Flag key reconciled: removed legacy "${legacyKey}" (canonical "${canonicalKey}" already exists)`);
    } else {
      await db.update(featureFlags)
        .set({ key: canonicalKey, updatedAt: new Date() })
        .where(eq(featureFlags.key, legacyKey))
        .run();
      console.log(`[seed] Flag key reconciled: "${legacyKey}" → "${canonicalKey}"`);
    }

    // Migrate any per-machine overrides that referenced the legacy key.
    // (machine_flag has no FK to feature_flag; the key is the join.)
    // If a machine already has an override for the canonical key, drop the
    // legacy one (canonical wins); otherwise rename it.
    const legacyOverrides = await db
      .select()
      .from(machineFlags)
      .where(eq(machineFlags.flagKey, legacyKey))
      .all();
    for (const ov of legacyOverrides) {
      const canonicalOv = await db
        .select()
        .from(machineFlags)
        .where(and(eq(machineFlags.machineId, ov.machineId), eq(machineFlags.flagKey, canonicalKey)))
        .get();
      if (canonicalOv) {
        await db.delete(machineFlags)
          .where(and(eq(machineFlags.machineId, ov.machineId), eq(machineFlags.flagKey, legacyKey)))
          .run();
      } else {
        await db.update(machineFlags)
          .set({ flagKey: canonicalKey })
          .where(and(eq(machineFlags.machineId, ov.machineId), eq(machineFlags.flagKey, legacyKey)))
          .run();
      }
    }
  }

  // ─── 2. Insert missing predefined flags ───────────────────────────
  let seeded = 0;
  for (const def of PREDEFINED_FLAG_DEFINITIONS) {
    const existing = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.key, def.key))
      .get();

    if (existing) continue;

    await db.insert(featureFlags).values({
      id: stableFlagId(def.key),
      key: def.key,
      value: String(def.defaultValue), // value column is TEXT (v1.2 migration)
      description: def.description,
      enabled: true,
      createdBy: 'system',
    });
    seeded++;
  }

  if (seeded > 0) {
    console.log(`[seed] ${seeded} feature flags created`);
  } else {
    console.log('[seed] Feature flags already seeded (0 created)');
  }
}

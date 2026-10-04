/**
 * Machine Heartbeat — keeps the local host "active" on the dashboard.
 *
 * The dashboard derives a machine's status from its `last_seen`:
 *   - last_seen null            → "pending" (registered, never connected)
 *   - last_seen within timeout  → "active"
 *   - last_seen stale           → "offline"
 *
 * The local kill-switch host is seeded in db/index.ts WITHOUT a last_seen,
 * so it renders as "pending" until something sends a heartbeat. This service
 * fixes that by:
 *   1. Upserting the local machine with a fresh `last_seen` on startup.
 *   2. Re-stamping `last_seen` every 30s so the host stays "active".
 *   3. Persisting one `machine_heartbeat_log` row per tick (H5.1) so the
 *      dashboard can chart history, not just the live pointer.
 *   4. Publishing a `machine-heartbeat` event via Redis pubsub so the
 *      frontend WebSocket hook refetches machines in real time.
 *
 * Mirrors the startMetricGeneration() pattern (idempotent, guarded).
 *
 * DB access uses raw SQLite rather than the Drizzle query builder: several
 * suites globally mock `drizzle-orm`, which breaks the builder's internal
 * `sql` template. Same rationale as services/audit-chain.ts.
 */

import { sqlite } from '../db/index';
import { collectRealMetrics } from './system-metrics';

// ─── Local machine identity ────────────────────────────────────────
const LOCAL_MACHINE_HOSTNAME = process.env.ALYGN_MACHINE_HOSTNAME ?? 'localhost';
const LOCAL_MACHINE_ID = `machine-${LOCAL_MACHINE_HOSTNAME.split('.')[0]}`;
const LOCAL_MACHINE_NAME = process.env.ALYGN_MACHINE_NAME ?? LOCAL_MACHINE_HOSTNAME.split('.')[0];
const LOCAL_MACHINE_ROLE = 'primary';

const HEARTBEAT_INTERVAL_MS = 30_000; // 30s — matches the task spec
const HEARTBEAT_CHANNEL = 'bcp:machines:events';

// ─── Retention ─────────────────────────────────────────────────────
// Heartbeat history is bounded by the same operator setting that bounds the
// audit log, so there is one retention knob to reason about.
const RETENTION_SETTING_KEY = 'audit_log_retention_days';
const DEFAULT_RETENTION_DAYS = 30;
const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 365;
const RETENTION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // hourly
const MS_PER_DAY = 24 * 60 * 60 * 1000;

let _interval: ReturnType<typeof setInterval> | null = null;
let _publish: ((channel: string, msg: string) => Promise<void>) | null = null;
let _running = false;
let _lastCleanupAt = 0;

export interface HeartbeatSample {
  cpu?: number | null;
  memory?: number | null;
  status?: string;
}

// Drizzle's `timestamp` mode stores epoch SECONDS; raw writes must match so
// the column stays readable by the Drizzle-backed machine serializer.
function toEpochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/**
 * Resolve the heartbeat retention window from the `audit_log_retention_days`
 * setting. Falls back to the default when the setting is missing or malformed,
 * and clamps to the range the settings API accepts (1–365).
 */
export async function getHeartbeatRetentionDays(): Promise<number> {
  try {
    const row = sqlite
      .query('SELECT value FROM setting WHERE key = ?')
      .get(RETENTION_SETTING_KEY) as { value: string } | null;

    const parsed = row ? Number.parseInt(row.value, 10) : Number.NaN;
    if (!Number.isFinite(parsed)) return DEFAULT_RETENTION_DAYS;
    return Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, parsed));
  } catch {
    return DEFAULT_RETENTION_DAYS;
  }
}

/**
 * Append one heartbeat sample to the history log. Never throws — a failed
 * history write must not take down the live heartbeat path.
 */
export async function recordHeartbeat(machineId: string, sample: HeartbeatSample = {}): Promise<void> {
  try {
    sqlite.run(
      `INSERT INTO machine_heartbeat_log (id, machine_id, timestamp, cpu, memory, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        machineId,
        toEpochSeconds(new Date()),
        sample.cpu ?? null,
        sample.memory ?? null,
        sample.status ?? 'active',
      ],
    );
  } catch (err: unknown) {
    console.error('[heartbeat] Failed to persist heartbeat row:', err instanceof Error ? err.message : String(err));
  }
}

/**
 * Delete heartbeat rows older than the retention window. Returns the number
 * of rows removed. `retentionDays` overrides the setting (used by tests).
 */
export async function cleanupHeartbeatLog(retentionDays?: number): Promise<number> {
  const days = retentionDays ?? (await getHeartbeatRetentionDays());
  const cutoff = toEpochSeconds(new Date(Date.now() - days * MS_PER_DAY));
  const result = sqlite.run('DELETE FROM machine_heartbeat_log WHERE timestamp < ?', [cutoff]);
  return result.changes;
}

/**
 * Stamp the local machine's last_seen to now. Idempotent — inserts the
 * machine if it's missing (e.g. a fresh DB), otherwise updates in place.
 * Also appends a heartbeat history row. Returns the machine id on success,
 * null on failure.
 */
export async function stampLocalMachineHeartbeat(): Promise<string | null> {
  const now = new Date();

  try {
    const existing = sqlite
      .query('SELECT id FROM machine WHERE id = ?')
      .get(LOCAL_MACHINE_ID);

    if (existing) {
      sqlite.run('UPDATE machine SET last_seen = ?, status = ? WHERE id = ?', [
        toEpochSeconds(now),
        'active',
        LOCAL_MACHINE_ID,
      ]);
    } else {
      sqlite.run(
        `INSERT INTO machine (id, name, hostname, status, role, has_dpu, specs, last_seen, created_at)
         VALUES (?, ?, ?, 'active', ?, 0, ?, ?, ?)`,
        [
          LOCAL_MACHINE_ID,
          LOCAL_MACHINE_NAME,
          LOCAL_MACHINE_HOSTNAME,
          LOCAL_MACHINE_ROLE,
          JSON.stringify({ gpu: 'none', cpu: 'arch', cores: 8 }),
          toEpochSeconds(now),
          toEpochSeconds(now),
        ],
      );
    }

    const metrics = collectRealMetrics();
    await recordHeartbeat(LOCAL_MACHINE_ID, {
      cpu: metrics.cpuUsage,
      memory: metrics.memoryUsage,
      status: 'active',
    });

    return LOCAL_MACHINE_ID;
  } catch (err: unknown) {
    console.error('[heartbeat] Failed to stamp local machine:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export interface MachineHeartbeatOpts {
  intervalMs?: number;
  publish?: (channel: string, msg: string) => Promise<void>;
}

/**
 * Start periodic local-machine heartbeats.
 *
 * On startup: stamps the local machine immediately so it shows "active"
 * right away (no waiting for the first interval tick).
 *
 * Every intervalMs (default 30s): re-stamps last_seen, appends a history
 * row, and publishes a `machine-heartbeat` event so the dashboard updates
 * live. Retention cleanup runs on startup and at most hourly thereafter.
 */
export function startMachineHeartbeat(opts: MachineHeartbeatOpts = {}): void {
  if (_interval) return;

  _publish = opts.publish || null;
  const intervalMs = opts.intervalMs ?? HEARTBEAT_INTERVAL_MS;

  console.log(`[heartbeat] Local machine heartbeat every ${intervalMs}ms`);

  // Stamp immediately on startup so the machine is "active" from the first
  // render (no 30s wait for the first interval tick).
  stampLocalMachineHeartbeat().then((id) => {
    if (id) console.log(`[heartbeat] Local machine "${id}" marked active`);
  });

  _lastCleanupAt = Date.now();
  cleanupHeartbeatLog()
    .then((deleted) => {
      if (deleted > 0) console.log(`[heartbeat] Retention cleanup removed ${deleted} row(s)`);
    })
    .catch((err: unknown) => {
      console.error('[heartbeat] Retention cleanup failed:', err instanceof Error ? err.message : String(err));
    });

  _interval = setInterval(async () => {
    if (_running) return;
    _running = true;

    try {
      const id = await stampLocalMachineHeartbeat();
      if (id && _publish) {
        try {
          await _publish(HEARTBEAT_CHANNEL, JSON.stringify({
            type: 'machine-heartbeat',
            payload: { machineId: id, timestamp: new Date().toISOString() },
          }));
        } catch { /* Redis unavailable — heartbeat still persisted locally */ }
      }

      if (Date.now() - _lastCleanupAt >= RETENTION_CLEANUP_INTERVAL_MS) {
        _lastCleanupAt = Date.now();
        const deleted = await cleanupHeartbeatLog();
        if (deleted > 0) console.log(`[heartbeat] Retention cleanup removed ${deleted} row(s)`);
      }
    } catch (err: unknown) {
      console.error('[heartbeat] Interval error:', err instanceof Error ? err.message : String(err));
    } finally {
      _running = false;
    }
  }, intervalMs);
}

export function stopMachineHeartbeat(): void {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
    _publish = null;
    console.log('[heartbeat] Local machine heartbeat stopped');
  }
}

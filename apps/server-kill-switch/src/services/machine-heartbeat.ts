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
 *   3. Publishing a `machine-heartbeat` event via Redis pubsub so the
 *      frontend WebSocket hook refetches machines in real time.
 *
 * Mirrors the startMetricGeneration() pattern (idempotent, guarded).
 */

import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { machines } from '../db/schema';

// ─── Local machine identity ────────────────────────────────────────
const LOCAL_MACHINE_ID = process.env.ALYGN_MACHINE_ID ?? 'local-machine';
const LOCAL_MACHINE_NAME = process.env.ALYGN_MACHINE_NAME ?? 'local-machine';
const LOCAL_MACHINE_HOSTNAME = process.env.ALYGN_MACHINE_HOSTNAME ?? 'localhost';
const LOCAL_MACHINE_ROLE = 'primary';

const HEARTBEAT_INTERVAL_MS = 30_000; // 30s — matches the task spec
const HEARTBEAT_CHANNEL = 'bcp:machines:events';

let _interval: ReturnType<typeof setInterval> | null = null;
let _publish: ((channel: string, msg: string) => Promise<void>) | null = null;
let _running = false;

/**
 * Stamp the local machine's last_seen to now. Idempotent — inserts the
 * machine if it's missing (e.g. a fresh DB), otherwise updates in place.
 * Returns the machine id on success, null on failure.
 */
export async function stampLocalMachineHeartbeat(): Promise<string | null> {
  const now = new Date();

  try {
    const existing = await db
      .select({ id: machines.id })
      .from(machines)
      .where(eq(machines.id, LOCAL_MACHINE_ID))
      .get();

    if (existing) {
      await db
        .update(machines)
        .set({ lastSeen: now, status: 'active' })
        .where(eq(machines.id, LOCAL_MACHINE_ID));
    } else {
      await db.insert(machines).values({
        id: LOCAL_MACHINE_ID,
        name: LOCAL_MACHINE_NAME,
        hostname: LOCAL_MACHINE_HOSTNAME,
        status: 'active',
        role: LOCAL_MACHINE_ROLE,
        hasDpu: false,
        specs: JSON.stringify({ gpu: 'none', cpu: 'arch', cores: 8 }),
        lastSeen: now,
        createdAt: now,
      });
    }

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
 * Every intervalMs (default 30s): re-stamps last_seen and publishes a
 * `machine-heartbeat` event so the dashboard updates live.
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

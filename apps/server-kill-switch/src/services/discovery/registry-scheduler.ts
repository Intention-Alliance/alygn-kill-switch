/**
 * Registry Scheduler — periodic sweep + provider probe + online/offline reconciliation.
 *
 * KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §a.2.
 *
 * Drives the existing discovery orchestrator on a periodic schedule so the
 * dashboard shows real machines, agents, providers, and models. Mirrors the
 * `system-metrics.ts` pattern: module-level interval + `_running` guard.
 *
 * Behavior:
 *   1. Startup seed sweep — run one runNetworkSweep() immediately.
 *   2. Periodic sweep — every sweepIntervalMs, call orchestrator.runNetworkSweep().
 *      New hosts enter NEW_MACHINE (never auto-admitted). Publish a
 *      `bcp:discovery:events` message when new machines are found.
 *   3. Periodic provider probe — every probeIntervalMs, for each ADMITTED
 *      machine, call orchestrator.detectProvidersForMachine(). Publish a
 *      `bcp:discovery:events` message when a provider transitions
 *      healthy↔unhealthy.
 *   4. Online/offline reconciliation — every sweepIntervalMs, mark machines
 *      offline whose lastSeen is older than heartbeatTimeoutMs.
 *   5. Guard — `_running` flag prevents overlapping ticks. Each tick is
 *      wrapped in try/catch so one failing probe never stops the loop.
 */

import { and, eq, lt } from 'drizzle-orm';
import { db } from '../../db/index';
import { discoveredMachines, discoveredProviders } from '../../db/schema';
import { DiscoveryOrchestrator } from './orchestrator';

export interface RegistrySchedulerOpts {
  heartbeatTimeoutMs?: number;   // default 90_000  (90s)
  sweepIntervalMs?: number;      // default 60_000  (60s)
  probeIntervalMs?: number;      // default 120_000 (120s)
  publish?: (channel: string, msg: string) => Promise<void>;
  orchestrator?: DiscoveryOrchestrator;
}

export const DISCOVERY_EVENTS_CHANNEL = 'bcp:discovery:events';

// ─── Module-level state (mirrors system-metrics.ts) ─────────────

let _sweepInterval: ReturnType<typeof setInterval> | null = null;
let _probeInterval: ReturnType<typeof setInterval> | null = null;
let _publish: ((channel: string, msg: string) => Promise<void>) | null = null;
let _orchestrator: DiscoveryOrchestrator | null = null;
let _heartbeatTimeoutMs = 90_000;
let _running = false;

function publishEvent(payload: unknown): void {
  if (!_publish) return;
  void _publish(DISCOVERY_EVENTS_CHANNEL, JSON.stringify(payload)).catch((err) => {
    console.warn('[registry-scheduler] Redis publish dropped:', err instanceof Error ? err.message : err);
  });
}

// ─── Tick implementations ───────────────────────────────────────

async function runSweepTick(): Promise<void> {
  if (!_orchestrator) return;
  const result = await _orchestrator.runNetworkSweep();
  if (result.discovered.length > 0) {
    publishEvent({
      type: 'discovery-sweep',
      payload: {
        discovered: result.discovered.map((m) => ({
          id: m.id,
          hostname: m.hostname,
          ip: m.ip,
          source: m.source,
          state: m.state,
        })),
        skipped: result.skipped,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

async function runProviderProbeTick(): Promise<void> {
  if (!_orchestrator) return;

  // Probe only ADMITTED machines (ADR-135 §5 — provisional machines are not
  // probed until confirmed).
  const admitted = await db
    .select({ id: discoveredMachines.id })
    .from(discoveredMachines)
    .where(eq(discoveredMachines.state, 'ADMITTED'))
    .all();

  for (const machine of admitted) {
    try {
      const results = await _orchestrator.detectProvidersForMachine(machine.id);
      // Detect healthy↔unhealthy transitions for event publishing.
      for (const result of results) {
        const healthy = result.health.healthy;
        const existing = await db
          .select({ status: discoveredProviders.status })
          .from(discoveredProviders)
          .where(
            and(
              eq(discoveredProviders.machineId, machine.id),
              eq(discoveredProviders.providerId, result.provider.id),
            ),
          )
          .get();
        const prevStatus = existing?.status ?? 'detected';
        const newStatus = healthy ? 'healthy' : 'unhealthy';
        if (prevStatus !== newStatus) {
          publishEvent({
            type: 'provider-status-change',
            payload: {
              machineId: machine.id,
              providerId: result.provider.id,
              previousStatus: prevStatus,
              newStatus,
              timestamp: new Date().toISOString(),
            },
          });
        }
      }
    } catch (err: unknown) {
      // A machine deleted mid-probe (FK error) or a probe failure must not
      // stop the loop — skip and continue.
      console.warn('[registry-scheduler] Provider probe failed for machine', machine.id, ':', err instanceof Error ? err.message : err);
    }
  }
}

async function runReconciliationTick(): Promise<void> {
  const cutoff = new Date(Date.now() - _heartbeatTimeoutMs);
  // Machines whose lastSeen is older than the heartbeat timeout are offline.
  const stale = await db
    .select({ id: discoveredMachines.id, lastSeen: discoveredMachines.lastSeen })
    .from(discoveredMachines)
    .where(lt(discoveredMachines.lastSeen, cutoff))
    .all();

  if (stale.length > 0) {
    publishEvent({
      type: 'registry-reconciliation',
      payload: {
        offline: stale.map((m) => ({
          id: m.id,
          lastSeen: m.lastSeen instanceof Date ? m.lastSeen.toISOString() : new Date(Number(m.lastSeen)).toISOString(),
        })),
        timestamp: new Date().toISOString(),
      },
    });
  }
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Start the registry scheduler. Idempotent — calling while already running is
 * a no-op.
 */
export function startRegistryScheduler(opts: RegistrySchedulerOpts = {}): void {
  if (_sweepInterval) return;

  _publish = opts.publish || null;
  _orchestrator = opts.orchestrator ?? new DiscoveryOrchestrator();
  _heartbeatTimeoutMs = opts.heartbeatTimeoutMs ?? 90_000;
  const sweepIntervalMs = opts.sweepIntervalMs ?? 60_000;
  const probeIntervalMs = opts.probeIntervalMs ?? 120_000;

  console.log(`[registry-scheduler] Starting: sweep every ${sweepIntervalMs}ms, probe every ${probeIntervalMs}ms, heartbeat timeout ${_heartbeatTimeoutMs}ms`);

  // Startup seed sweep — populate the registry within seconds, not a minute.
  void runSweepTick().catch((err) => {
    console.error('[registry-scheduler] Startup sweep failed:', err instanceof Error ? err.message : err);
  });

  _sweepInterval = setInterval(async () => {
    if (_running) return;
    _running = true;
    try {
      await runSweepTick();
      await runReconciliationTick();
    } catch (err: unknown) {
      console.error('[registry-scheduler] Sweep tick error:', err instanceof Error ? err.message : err);
    } finally {
      _running = false;
    }
  }, sweepIntervalMs);

  _probeInterval = setInterval(async () => {
    if (_running) return;
    _running = true;
    try {
      await runProviderProbeTick();
    } catch (err: unknown) {
      console.error('[registry-scheduler] Probe tick error:', err instanceof Error ? err.message : err);
    } finally {
      _running = false;
    }
  }, probeIntervalMs);
}

/**
 * Stop the registry scheduler. Idempotent.
 */
export function stopRegistryScheduler(): void {
  if (_sweepInterval) {
    clearInterval(_sweepInterval);
    _sweepInterval = null;
  }
  if (_probeInterval) {
    clearInterval(_probeInterval);
    _probeInterval = null;
  }
  _publish = null;
  _orchestrator = null;
  console.log('[registry-scheduler] Stopped');
}

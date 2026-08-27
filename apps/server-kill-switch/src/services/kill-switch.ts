// Kill Switch Service — State machine + transitions + audit log
// Extracted from kill-switch-service.mjs

import type { KillSwitchState } from '@align/shared-types';
import type { RedisPool } from '../types/redis-pool';
import { secureCompare } from '../utils/secure-compare';
import { loadTracing } from '../infra-loader';
import { pauseInferenceTraffic, resumeInferenceTraffic } from './traffic-pause';
import { db } from '../db/index';
import { killSwitchAuditLog } from '../db/schema';
import { appendAuditEntry } from './audit-chain';
import { desc, sql } from 'drizzle-orm';

export const STATES: Record<KillSwitchState, KillSwitchState> = {
  ARMED: 'ARMED',
  RUNNING: 'RUNNING',
  STOPPING: 'STOPPING',
  STOPPED: 'STOPPED',
  LOCKED: 'LOCKED',
};

export const VALID_TRANSITIONS: Record<KillSwitchState, KillSwitchState[]> = {
  ARMED: [STATES.RUNNING, STATES.STOPPED, STATES.LOCKED],
  RUNNING: [STATES.STOPPING, STATES.STOPPED, STATES.LOCKED],
  STOPPING: [STATES.STOPPED, STATES.LOCKED],
  STOPPED: [STATES.ARMED, STATES.LOCKED, STATES.RUNNING],
  LOCKED: [STATES.STOPPED],
};

const PUBSUB_CHANNEL = 'bcp:kill-switch:chaos';

export interface AuditEntry {
  id: string;
  previousState: KillSwitchState;
  newState: KillSwitchState;
  timestamp: string;
  traceId: string;
  initiatedBy: string;
  reason: string;
  ip: string;
  /** machineId of the machine whose inference/telemetry triggered an automated kill (spec §d.1). */
  machineId?: string;
}

export interface TransitionMetadata {
  userId?: string;
  reason?: string;
  ip?: string;
  /** machineId of the machine whose inference/telemetry triggered an automated kill (spec §d.1). */
  machineId?: string;
}

export class KillSwitchService {
  public readonly redis: RedisPool;
  private authToken: string;
  private apiKey: string;
  private auditLog: AuditEntry[] = [];
  private _stateChangeListeners: Array<(entry: AuditEntry) => void | Promise<void>> = [];
  // Guards the one-time startup DB load so a hot reload doesn't double-load.
  private _dbLoaded = false;
  // Hot-cache cap — matches the in-memory trim used on push.
  private static readonly HOT_CACHE_SIZE = 1000;

  constructor(opts: { redis: RedisPool; authToken?: string; apiKey?: string }) {
    this.redis = opts.redis;
    this.authToken = opts.authToken || process.env.KILL_SWITCH_AUTH_TOKEN || '';
    this.apiKey = opts.apiKey || process.env.KILL_SWITCH_API_KEY || '';
  }

  // ─── Authentication ──────────────────────────────────────────────

  authenticate(req: { headers: Record<string, string | undefined> }): boolean {
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      if (secureCompare(token, this.authToken)) return true;
    }

    const apiKeyHeader = req.headers['x-api-key'];
    if (secureCompare(apiKeyHeader, this.apiKey)) return true;

    return false;
  }

  // ─── State Management ────────────────────────────────────────────

  async getCurrentState(): Promise<KillSwitchState> {
    const state = await this.redis.get(this.redis.chaosKillSwitchKey());
    return (state as KillSwitchState) || STATES.RUNNING;
  }

  async transitionTo(newState: KillSwitchState, metadata: TransitionMetadata = {}): Promise<AuditEntry> {
    const { recordSpan } = await loadTracing();
    return recordSpan('kill-switch.transition', {
      'kill_switch.target_state': newState,
      'kill_switch.initiated_by': metadata.userId || 'system',
    }, async (span: any) => {
      const currentState = await this.getCurrentState();

      if (!VALID_TRANSITIONS[currentState]?.includes(newState)) {
        const err = new Error(`Invalid transition: ${currentState} → ${newState}`);
        (err as any).statusCode = 409;
        (err as any).current = currentState;
        (err as any).allowed = VALID_TRANSITIONS[currentState] || [];
        throw err;
      }

      await this.redis.set(this.redis.chaosKillSwitchKey(), newState);

      // ─── Traffic pause hook (ADR-141) ───────────────────────────
      // The missing 5th kill-switch piece: when state → STOPPED, pause
      // inference traffic; when state → RUNNING, resume it. Gated by the
      // kill_switch_traffic_pause_enabled feature flag so the demo can
      // disable it if needed. Idempotent + race-safe (see traffic-pause.ts).
      if (newState === STATES.STOPPED) {
        await pauseInferenceTraffic();
      } else if (currentState === STATES.STOPPED && newState === STATES.RUNNING) {
        await resumeInferenceTraffic();
      }

      const message = {
        previousState: currentState,
        newState,
        timestamp: new Date().toISOString(),
        traceId: span.spanContext().traceId,
        initiatedBy: metadata.userId || 'system',
        reason: metadata.reason || 'manual',
        machineId: metadata.machineId,
      };

      await this.redis.publish(PUBSUB_CHANNEL, JSON.stringify(message));

      const auditEntry: AuditEntry = {
        id: crypto.randomUUID(),
        previousState: currentState,
        newState,
        timestamp: message.timestamp,
        traceId: message.traceId,
        initiatedBy: message.initiatedBy,
        reason: message.reason,
        ip: metadata.ip || 'unknown',
        machineId: metadata.machineId,
      };

      this.auditLog.push(auditEntry);
      if (this.auditLog.length > KillSwitchService.HOT_CACHE_SIZE) {
        this.auditLog = this.auditLog.slice(-KillSwitchService.HOT_CACHE_SIZE);
      }

      // Persist to the immutable DB audit log via the tamper-evident audit
      // chain (ADR-140). appendAuditEntry computes prev_hash (linking to the
      // prior entry's self_hash), self_hash, and server_hmac, and inserts
      // under a write lock so concurrent transitions cannot collide on the
      // chain link. Fire-and-forget — a DB write failure must not block the
      // state transition or the HTTP response.
      try {
        await appendAuditEntry({
          userId: auditEntry.initiatedBy,
          reason: auditEntry.reason,
          previousState: auditEntry.previousState,
          newState: auditEntry.newState,
          traceId: auditEntry.traceId,
          machineId: auditEntry.machineId ?? null,
          severity: 'info',
          metadata: JSON.stringify({ ip: auditEntry.ip }),
          plainExplanation: `Kill switch state transition ${auditEntry.previousState} → ${auditEntry.newState} initiated by ${auditEntry.initiatedBy} (${auditEntry.reason}).`,
        });
      } catch (err) {
        console.error('[kill-switch] Failed to persist audit entry to DB:', err);
      }

      for (const listener of this._stateChangeListeners) {
        try { await listener(auditEntry); } catch { /* ignore */ }
      }

      span.setAttribute('kill_switch.previous_state', currentState);
      span.setAttribute('kill_switch.transition_complete', true);

      return auditEntry;
    }) as Promise<AuditEntry>;
  }

  // ─── PubSub ──────────────────────────────────────────────────────

  async subscribeToStateChanges(handler: (message: string) => void): Promise<void> {
    await this.redis.subscribe(PUBSUB_CHANNEL, handler);
  }

  onStateChange(listener: (entry: AuditEntry) => void | Promise<void>): void {
    this._stateChangeListeners.push(listener);
  }

  // ─── Health Check ───────────────────────────────────────────────

  async healthCheck() {
    const redisHealth = await this.redis.healthCheck();
    const state = await this.getCurrentState();

    return {
      status: redisHealth.redis === 'OK' ? 'healthy' : 'degraded',
      killSwitchState: state,
      redis: redisHealth,
      auditLogSize: this.auditLog.length,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── Audit Log ───────────────────────────────────────────────────

  /**
   * Load recent audit entries from the DB into the in-memory hot cache.
   * Called once on startup to recover history after a process restart or
   * container rebuild (the in-memory buffer starts empty).
   */
  async loadAuditFromDb(): Promise<void> {
    if (this._dbLoaded) return;
    this._dbLoaded = true;

    try {
      const rows = await db.select()
        .from(killSwitchAuditLog)
        .orderBy(desc(killSwitchAuditLog.timestamp))
        .limit(KillSwitchService.HOT_CACHE_SIZE)
        .all();

      // Reverse to chronological order (oldest first) so the hot cache
      // matches the push-order semantics of transitionTo().
      for (const row of rows.reverse()) {
        this.auditLog.push({
          id: row.id,
          previousState: row.previousState as KillSwitchState,
          newState: row.newState as KillSwitchState,
          timestamp: new Date(row.timestamp).toISOString(),
          traceId: row.traceId,
          initiatedBy: row.userId,
          reason: row.reason,
          ip: 'unknown',
          machineId: row.machineId ?? undefined,
        });
      }

      if (this.auditLog.length > KillSwitchService.HOT_CACHE_SIZE) {
        this.auditLog = this.auditLog.slice(-KillSwitchService.HOT_CACHE_SIZE);
      }

      console.log(`[kill-switch] Loaded ${this.auditLog.length} audit entries from DB`);
    } catch (err) {
      console.error('[kill-switch] Failed to load audit log from DB:', err);
    }
  }

  getAuditLog(limit = 50): AuditEntry[] {
    return this.auditLog.slice(-limit);
  }

  /**
   * Seed a single "System initialized" audit entry if the DB audit log is
   * empty. Called once on startup so the dashboard's audit log is never
   * blank after a fresh container rebuild (the DB starts empty and no state
   * change has occurred yet to populate it).
   *
   * Idempotent: only writes when there are zero rows, so it never duplicates
   * on restart. The entry is also pushed into the in-memory hot cache so the
   * WebSocket `audit-entry` broadcast and the activations endpoint reflect it
   * immediately.
   *
   * ADR-140 chain wiring: the seed is written through appendAuditEntry so it
   * becomes the GENESIS entry of the tamper-evident chain (real self_hash +
   * server_hmac). This is the "mark as legacy and start a fresh anchored
   * chain" choice: the seed is the anchor head, and every subsequent
   * transition chains off its self_hash. (The old raw db.insert wrote
   * prev_hash='GENESIS' + self_hash='' which would have broken the chain link
   * for the first real transition.)
   */
  async seedInitialAuditEntry(): Promise<void> {
    try {
      const count = await db
        .select({ count: sql`count(*)` })
        .from(killSwitchAuditLog)
        .get();
      const total = Number(count?.count ?? 0);
      if (total > 0) return;

      const now = new Date();
      const entry: AuditEntry = {
        id: crypto.randomUUID(),
        previousState: STATES.RUNNING,
        newState: STATES.RUNNING,
        timestamp: now.toISOString(),
        traceId: `seed-${crypto.randomUUID().slice(0, 8)}`,
        initiatedBy: 'system',
        reason: 'System initialized — kill switch running',
        ip: 'system',
      };

      await appendAuditEntry({
        userId: entry.initiatedBy,
        reason: entry.reason,
        previousState: entry.previousState,
        newState: entry.newState,
        traceId: entry.traceId,
        machineId: null,
        severity: 'info',
        metadata: JSON.stringify({ ip: entry.ip, seed: true }),
        plainExplanation: 'System initialized — kill switch running (seed entry, chain genesis).',
      });

      this.auditLog.push(entry);
      console.log('[kill-switch] Seeded initial audit entry (empty DB)');
    } catch (err) {
      console.error('[kill-switch] Failed to seed initial audit entry:', err instanceof Error ? err.message : err);
    }
  }

  getLastActivation(): { timestamp: string | null; by: string | null; reason: string | null } {
    const activations = this.auditLog.filter(
      (e) => e.newState === 'RUNNING' || e.newState === 'STOPPING'
    );
    const last = activations[activations.length - 1];
    return {
      timestamp: last?.timestamp ?? null,
      by: last?.initiatedBy ?? null,
      reason: last?.reason ?? null,
    };
  }
}
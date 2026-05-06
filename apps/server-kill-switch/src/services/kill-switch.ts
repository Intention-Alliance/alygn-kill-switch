// Kill Switch Service — State machine + transitions + audit log
// Extracted from kill-switch-service.mjs

import type { KillSwitchState } from '@align/shared-types';
import type { RedisPool } from '../types/redis-pool';
import { secureCompare } from '../utils/secure-compare';
import { loadTracing } from '../infra-loader';

export const STATES: Record<KillSwitchState, KillSwitchState> = {
  ARMED: 'ARMED',
  RUNNING: 'RUNNING',
  STOPPING: 'STOPPING',
  STOPPED: 'STOPPED',
  LOCKED: 'LOCKED',
};

export const VALID_TRANSITIONS: Record<KillSwitchState, KillSwitchState[]> = {
  ARMED: [STATES.RUNNING, STATES.LOCKED],
  RUNNING: [STATES.STOPPING, STATES.LOCKED],
  STOPPING: [STATES.STOPPED, STATES.LOCKED],
  STOPPED: [STATES.ARMED, STATES.LOCKED],
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
}

export interface TransitionMetadata {
  userId?: string;
  reason?: string;
  ip?: string;
}

export class KillSwitchService {
  private redis: RedisPool;
  private authToken: string;
  private apiKey: string;
  private auditLog: AuditEntry[] = [];
  private _stateChangeListeners: Array<(entry: AuditEntry) => void | Promise<void>> = [];

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
    return (state as KillSwitchState) || STATES.ARMED;
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

      const message = {
        previousState: currentState,
        newState,
        timestamp: new Date().toISOString(),
        traceId: span.spanContext().traceId,
        initiatedBy: metadata.userId || 'system',
        reason: metadata.reason || 'manual',
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
      };

      this.auditLog.push(auditEntry);
      if (this.auditLog.length > 1000) {
        this.auditLog = this.auditLog.slice(-1000);
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

  getAuditLog(limit = 50): AuditEntry[] {
    return this.auditLog.slice(-limit);
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
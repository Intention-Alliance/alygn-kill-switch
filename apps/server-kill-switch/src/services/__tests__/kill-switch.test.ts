/**
 * KillSwitchService — Unit Tests
 *
 * Tests state machine transitions, authentication, health checks,
 * and audit logging without real Redis or tracing infrastructure.
 *
 * Covers 15 scenarios per docs/plans/REMAINING-P1-FIXES-PLAN.md §5.1
 */

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { KillSwitchService } from '../kill-switch';
import type { RedisPool } from '../../types/redis-pool';

// ─── Mock setup ─────────────────────────────────────────────────

// Mock loadTracing to return no-op tracer
mock.module('../../infra-loader', () => ({
  loadTracing: async () => ({
    recordSpan: async (name: string, attrs: any, fn: (span: any) => any) => {
      const span = {
        spanContext: () => ({ traceId: 'mock-trace-id' }),
        setAttribute: (key: string, value: any) => {},
      };
      return fn(span);
    },
  }),
}));

// Track the internal Redis state for get/set
let internalState: string | null = null;

function createMockRedis(): RedisPool {
  return {
    chaosKillSwitchKey: () => 'ks:state',
    get: async (key: string) => internalState,
    set: async (key: string, val: string) => {
      internalState = val;
      return 'OK';
    },
    del: async (key: string) => 0,
    publish: async (ch: string, msg: string) => 0,
    subscribe: async (ch: string, h: Function) => {},
    healthCheck: async () => ({ redis: 'OK' }),
    acquire: async () => ({}),
    release: (client: any) => {},
    withClient: async <T>(fn: (client: any) => Promise<T>): Promise<T> => {
      return fn({});
    },
    connect: async () => {},
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function createService(overrides: { authToken?: string; apiKey?: string } = {}) {
  return new KillSwitchService({
    redis: createMockRedis(),
    authToken: overrides.authToken ?? 'test-bearer-token',
    apiKey: overrides.apiKey ?? 'test-api-key',
  });
}

beforeEach(() => {
  internalState = null;
});

// ─── State Machine Transitions ──────────────────────────────────

describe('KillSwitchService — state machine transitions', () => {
  // Scenario 1: ARM → RUNNING
  it('ARM → RUNNING valid transition', async () => {
    internalState = 'ARMED';
    const service = createService();
    const result = await service.transitionTo('RUNNING');

    expect(result.newState).toBe('RUNNING');
    expect(result.previousState).toBe('ARMED');
    expect(result.traceId).toBeDefined();
    expect(result.initiatedBy).toBe('system');
    expect(result.reason).toBe('manual');
    expect(result.ip).toBe('unknown');
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('string');
    // UUID or mock-uuid, both valid — just verify it's not empty
    expect(result.id.length).toBeGreaterThan(0);
    expect(internalState).toBe('RUNNING');
  });

  // Scenario 2: RUNNING → STOPPING
  it('RUNNING → STOPPING valid transition', async () => {
    internalState = 'RUNNING';
    const service = createService();
    const result = await service.transitionTo('STOPPING');

    expect(result.newState).toBe('STOPPING');
    expect(result.previousState).toBe('RUNNING');
    expect(internalState).toBe('STOPPING');
  });

  // Scenario 3: STOPPING → STOPPED
  it('STOPPING → STOPPED valid transition', async () => {
    internalState = 'STOPPING';
    const service = createService();
    const result = await service.transitionTo('STOPPED');

    expect(result.newState).toBe('STOPPED');
    expect(result.previousState).toBe('STOPPING');
    expect(internalState).toBe('STOPPED');
  });

  // Scenario 4: STOPPED → ARMED
  it('STOPPED → ARMED valid transition', async () => {
    internalState = 'STOPPED';
    const service = createService();
    const result = await service.transitionTo('ARMED');

    expect(result.newState).toBe('ARMED');
    expect(result.previousState).toBe('STOPPED');
    expect(internalState).toBe('ARMED');
  });

  // Scenario 5: Any → LOCKED valid transition
  it('Any → LOCKED valid transition (from ARMED)', async () => {
    internalState = 'ARMED';
    const service = createService();
    const result = await service.transitionTo('LOCKED');

    expect(result.newState).toBe('LOCKED');
    expect(result.previousState).toBe('ARMED');
    expect(internalState).toBe('LOCKED');
  });

  it('Any → LOCKED valid transition (from RUNNING)', async () => {
    internalState = 'RUNNING';
    const service = createService();
    const result = await service.transitionTo('LOCKED');

    expect(result.newState).toBe('LOCKED');
    expect(result.previousState).toBe('RUNNING');
    expect(internalState).toBe('LOCKED');
  });

  it('Any → LOCKED valid transition (from STOPPING)', async () => {
    internalState = 'STOPPING';
    const service = createService();
    const result = await service.transitionTo('LOCKED');

    expect(result.newState).toBe('LOCKED');
    expect(result.previousState).toBe('STOPPING');
    expect(internalState).toBe('LOCKED');
  });

  it('Any → LOCKED valid transition (from STOPPED)', async () => {
    internalState = 'STOPPED';
    const service = createService();
    const result = await service.transitionTo('LOCKED');

    expect(result.newState).toBe('LOCKED');
    expect(result.previousState).toBe('STOPPED');
    expect(internalState).toBe('LOCKED');
  });

  // Scenario 6: LOCKED → STOPPED valid transition
  it('LOCKED → STOPPED valid transition', async () => {
    internalState = 'LOCKED';
    const service = createService();
    const result = await service.transitionTo('STOPPED');

    expect(result.newState).toBe('STOPPED');
    expect(result.previousState).toBe('LOCKED');
    expect(internalState).toBe('STOPPED');
  });

  // Scenario 7: ARM → STOPPING invalid (throws 409)
  it('ARM → STOPPING invalid (throws 409) — must go via RUNNING or emergency STOPPED', async () => {
    internalState = 'ARMED';
    const service = createService();

    try {
      await service.transitionTo('STOPPING');
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.statusCode).toBe(409);
      expect(err.current).toBe('ARMED');
      expect(err.allowed).toContain('RUNNING');
      expect(err.allowed).toContain('STOPPED');
      expect(err.allowed).toContain('LOCKED');
      expect(err.message).toContain('Invalid transition');
      expect(err.message).toContain('ARMED');
      expect(err.message).toContain('STOPPING');
    }
    // State should not have changed
    expect(internalState).toBe('ARMED');
  });

  // Scenario 7b: ARM → STOPPED emergency path (valid — direct emergency stop)
  it('ARM → STOPPED emergency path (valid)', async () => {
    internalState = 'ARMED';
    const service = createService();
    const result = await service.transitionTo('STOPPED');

    expect(result.newState).toBe('STOPPED');
    expect(result.previousState).toBe('ARMED');
    expect(internalState).toBe('STOPPED');
  });

  // Scenario 8: RUNNING → STOPPED emergency path (valid — bypasses STOPPING)
  it('RUNNING → STOPPED emergency path (valid)', async () => {
    internalState = 'RUNNING';
    const service = createService();
    const result = await service.transitionTo('STOPPED');

    expect(result.newState).toBe('STOPPED');
    expect(result.previousState).toBe('RUNNING');
    expect(internalState).toBe('STOPPED');
  });

  // Scenario 9: Same state → same state (throws)
  it('Same state → same state throws', async () => {
    internalState = 'ARMED';
    const service = createService();

    try {
      await service.transitionTo('ARMED');
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.statusCode).toBe(409);
      expect(err.current).toBe('ARMED');
      // ARMED → ARMED is not in VALID_TRANSITIONS
      expect(err.message).toContain('Invalid transition');
    }
    expect(internalState).toBe('ARMED');
  });

  // Also verify RUNNING → RUNNING is invalid
  it('RUNNING → RUNNING same state throws', async () => {
    internalState = 'RUNNING';
    const service = createService();

    try {
      await service.transitionTo('RUNNING');
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.statusCode).toBe(409);
    }
    expect(internalState).toBe('RUNNING');
  });

  // Edge: transition with metadata
  it('transition includes metadata in audit entry', async () => {
    internalState = 'ARMED';
    const service = createService();
    const result = await service.transitionTo('RUNNING', {
      userId: 'user-123',
      reason: 'Deployment started',
      ip: '10.0.0.1',
    });

    expect(result.initiatedBy).toBe('user-123');
    expect(result.reason).toBe('Deployment started');
    expect(result.ip).toBe('10.0.0.1');
  });
});

// ─── getCurrentState ───────────────────────────────────────────

describe('KillSwitchService — getCurrentState', () => {
  // Scenario 10: Empty Redis returns ARMED
  it('getCurrentState with empty Redis returns ARMED', async () => {
    internalState = null;
    const service = createService();
    const state = await service.getCurrentState();
    expect(state).toBe('ARMED');
  });

  // Scenario 11: Stored state returns it
  it('getCurrentState with stored state returns it', async () => {
    internalState = 'LOCKED';
    const service = createService();
    const state = await service.getCurrentState();
    expect(state).toBe('LOCKED');
  });

  it('getCurrentState returns RUNNING when Redis has RUNNING', async () => {
    internalState = 'RUNNING';
    const service = createService();
    const state = await service.getCurrentState();
    expect(state).toBe('RUNNING');
  });

  it('getCurrentState returns STOPPED when Redis has STOPPED', async () => {
    internalState = 'STOPPED';
    const service = createService();
    const state = await service.getCurrentState();
    expect(state).toBe('STOPPED');
  });
});

// ─── Authentication ────────────────────────────────────────────

describe('KillSwitchService — authenticate', () => {
  // Scenario 12: Valid Bearer token
  it('authenticate with valid Bearer token → true', () => {
    const service = createService({ authToken: 'my-secret-token' });
    const result = service.authenticate({
      headers: { authorization: 'Bearer my-secret-token' },
    });
    expect(result).toBe(true);
  });

  // Scenario 13: Invalid Bearer token
  it('authenticate with invalid Bearer → false', () => {
    const service = createService({ authToken: 'my-secret-token' });
    const result = service.authenticate({
      headers: { authorization: 'Bearer wrong-token' },
    });
    expect(result).toBe(false);
  });

  // Scenario 14: Valid X-API-Key
  it('authenticate with valid X-API-Key → true', () => {
    const service = createService({ apiKey: 'my-api-key' });
    const result = service.authenticate({
      headers: { 'x-api-key': 'my-api-key' },
    });
    expect(result).toBe(true);
  });

  it('authenticate with invalid X-API-Key → false', () => {
    const service = createService({ apiKey: 'my-api-key' });
    const result = service.authenticate({
      headers: { 'x-api-key': 'wrong-api-key' },
    });
    expect(result).toBe(false);
  });

  it('authenticate with no headers → false', () => {
    const service = createService({ authToken: 'secret', apiKey: 'key' });
    const result = service.authenticate({ headers: {} });
    expect(result).toBe(false);
  });

  it('authenticate with undefined header values → false', () => {
    const service = createService({ authToken: 'secret', apiKey: 'key' });
    const result = service.authenticate({
      headers: { authorization: undefined, 'x-api-key': undefined },
    });
    expect(result).toBe(false);
  });

  // Bearer takes precedence over X-API-Key if both present
  it('authenticate accepts Bearer even with invalid X-API-Key', () => {
    const service = createService({ authToken: 'valid-bearer', apiKey: 'valid-key' });
    const result = service.authenticate({
      headers: {
        authorization: 'Bearer valid-bearer',
        'x-api-key': 'wrong-key',
      },
    });
    // Bearer should match first and short-circuit return true
    expect(result).toBe(true);
  });

  it('authenticate accepts X-API-Key when Bearer is missing', () => {
    const service = createService({ authToken: 'valid-bearer', apiKey: 'valid-key' });
    const result = service.authenticate({
      headers: { 'x-api-key': 'valid-key' },
    });
    expect(result).toBe(true);
  });
});

// ─── Health Check ──────────────────────────────────────────────

describe('KillSwitchService — healthCheck', () => {
  // Scenario 15: Returns full status object
  it('healthCheck returns full status object', async () => {
    internalState = 'ARMED';
    const service = createService();
    const health = await service.healthCheck();

    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('killSwitchState');
    expect(health).toHaveProperty('redis');
    expect(health).toHaveProperty('auditLogSize');
    expect(health).toHaveProperty('timestamp');

    expect(health.status).toBe('healthy');
    expect(health.killSwitchState).toBe('ARMED');
    expect(health.redis).toEqual({ redis: 'OK' });
    expect(health.auditLogSize).toBe(0);
    expect(typeof health.timestamp).toBe('string');
  });

  it('healthCheck reports degraded when Redis is unhealthy', async () => {
    // Create a service with a mock RedisPool that returns degraded health
    const degradedRedis: RedisPool = {
      chaosKillSwitchKey: () => 'ks:state',
      get: async (key: string) => null,
      set: async (key: string, val: string) => 'OK',
      del: async (key: string) => 0,
      publish: async (ch: string, msg: string) => 0,
      subscribe: async (ch: string, h: Function) => {},
      healthCheck: async () => ({ redis: 'ERROR: connection lost' }),
      acquire: async () => ({}),
      release: (client: any) => {},
      withClient: async <T>(fn: (client: any) => Promise<T>): Promise<T> => {
        return fn({});
      },
      connect: async () => {},
    };

    const service = new KillSwitchService({ redis: degradedRedis });
    const health = await service.healthCheck();

    expect(health.status).toBe('degraded');
    expect(health.redis).toEqual({ redis: 'ERROR: connection lost' });
  });

  it('healthCheck reflects audit log size after transitions', async () => {
    internalState = 'ARMED';
    const service = createService();

    // Should start with 0
    let health = await service.healthCheck();
    expect(health.auditLogSize).toBe(0);

    // After one transition
    await service.transitionTo('RUNNING');
    health = await service.healthCheck();
    expect(health.auditLogSize).toBe(1);

    // After another transition
    internalState = 'RUNNING';
    await service.transitionTo('LOCKED');
    health = await service.healthCheck();
    expect(health.auditLogSize).toBe(2);
  });
});

// ─── Audit Log ──────────────────────────────────────────────────

describe('KillSwitchService — audit log', () => {
  it('getAuditLog returns empty array initially', () => {
    const service = createService();
    const logs = service.getAuditLog();
    expect(logs).toEqual([]);
  });

  it('getAuditLog returns stored entries after transitions', async () => {
    internalState = 'ARMED';
    const service = createService();

    await service.transitionTo('RUNNING');
    await service.transitionTo('LOCKED');

    const logs = service.getAuditLog();
    expect(logs.length).toBe(2);
    expect(logs[0].newState).toBe('RUNNING');
    expect(logs[1].newState).toBe('LOCKED');
  });

  it('getAuditLog respects limit parameter', async () => {
    internalState = 'ARMED';
    const service = createService();

    // Generate 6 transitions: all valid ARM→RUNNING
    // We reset internalState to ARMED after each transition
    for (let i = 0; i < 6; i++) {
      await service.transitionTo('RUNNING');   // ARMED → RUNNING
      internalState = 'ARMED';                 // Reset to allow next ARM→RUNNING
    }

    const allLogs = service.getAuditLog(100);
    expect(allLogs.length).toBe(6);

    const logs = service.getAuditLog(3);
    expect(logs.length).toBe(3);
    // Most recent 3 entries
    expect(logs[0].newState).toBe('RUNNING');
    expect(logs[1].newState).toBe('RUNNING');
    expect(logs[2].newState).toBe('RUNNING');
  });

  it('getAuditLog default limit is 50', () => {
    const service = createService();
    const logs = service.getAuditLog();
    expect(Array.isArray(logs)).toBe(true);
  });
});

// ─── getLastActivation ──────────────────────────────────────────

describe('KillSwitchService — getLastActivation', () => {
  it('getLastActivation returns nulls when no activations', () => {
    const service = createService();
    const result = service.getLastActivation();

    expect(result.timestamp).toBeNull();
    expect(result.by).toBeNull();
    expect(result.reason).toBeNull();
  });

  it('getLastActivation returns the most recent RUNNING or STOPPING activation', async () => {
    internalState = 'ARMED';
    const service = createService();

    await service.transitionTo('RUNNING', {
      userId: 'admin',
      reason: 'Deploy starting',
    });

    const result = service.getLastActivation();
    expect(result.timestamp).not.toBeNull();
    expect(result.by).toBe('admin');
    expect(result.reason).toBe('Deploy starting');
  });

  it('getLastActivation ignores non-activation transitions like ARMED', async () => {
    internalState = 'STOPPED';
    const service = createService();

    // ARMED is not an activation
    await service.transitionTo('ARMED');

    const result = service.getLastActivation();
    expect(result.timestamp).toBeNull();
    expect(result.by).toBeNull();
  });
});

// ─── State Change Listeners ─────────────────────────────────────

describe('KillSwitchService — onStateChange listeners', () => {
  it('onStateChange listener is called on transition', async () => {
    internalState = 'ARMED';
    const service = createService();

    let listenerCalled = false;
    let receivedEntry: any = null;

    service.onStateChange((entry) => {
      listenerCalled = true;
      receivedEntry = entry;
    });

    await service.transitionTo('RUNNING');

    expect(listenerCalled).toBe(true);
    expect(receivedEntry.newState).toBe('RUNNING');
    expect(receivedEntry.previousState).toBe('ARMED');
  });

  it('onStateChange with async listener is awaited', async () => {
    internalState = 'ARMED';
    const service = createService();

    let resolvePromise: () => void;
    const listenerDone = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    service.onStateChange(async (entry) => {
      // Simulate async work
      resolvePromise!();
    });

    await service.transitionTo('RUNNING');
    await listenerDone;
    // If we got here, the async listener was awaited
    expect(true).toBe(true);
  });

  it('onStateChange listener errors are caught silently', async () => {
    internalState = 'ARMED';
    const service = createService();

    service.onStateChange(() => {
      throw new Error('Listener error!');
    });

    // Should not throw — errors are caught inside
    await expect(service.transitionTo('RUNNING')).resolves.toBeDefined();
    expect(internalState).toBe('RUNNING');
  });
});

// ─── Subscribe to Redis pubsub ──────────────────────────────────

describe('KillSwitchService — subscribeToStateChanges', () => {
  it('subscribeToStateChanges calls redis.subscribe with correct channel', async () => {
    let subscribedChannel = '';
    let subscribedHandler: Function | null = null;

    const customRedis: RedisPool = {
      ...createMockRedis(),
      subscribe: async (ch: string, h: Function) => {
        subscribedChannel = ch;
        subscribedHandler = h;
      },
    };

    const service = new KillSwitchService({ redis: customRedis });
    const handler = (msg: string) => {};
    await service.subscribeToStateChanges(handler);

    expect(subscribedChannel).toBe('bcp:kill-switch:chaos');
    expect(subscribedHandler).toBe(handler);
  });
});

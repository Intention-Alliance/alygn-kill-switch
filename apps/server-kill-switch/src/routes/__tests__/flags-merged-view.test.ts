/**
 * Merged per-machine flag view — unit tests
 *
 * Covers the F2/F3 fixes: the merged view is dynamic (predefined flags in
 * document order + any additional global flags + orphan overrides), never
 * silently drops flags (auto_stop_threshold regression), and surfaces
 * overrides by key.
 */

import { describe, it, expect, mock, beforeEach, beforeAll, afterAll } from 'bun:test';

// ─── Mock stores ────────────────────────────────────────────────

interface MockFlag {
  id: string;
  key: string;
  value: any;
  description: string | null;
  enabled: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MockMachineFlag {
  machineId: string;
  flagKey: string;
  value: string;
  updatedAt: Date;
}

interface MockMachine {
  id: string;
  hostname: string;
}

let flagsStore: MockFlag[] = [];
let machineFlagsStore: MockMachineFlag[] = [];
let machinesStore: MockMachine[] = [];

beforeEach(() => {
  flagsStore = [];
  machineFlagsStore = [];
  machinesStore = [{ id: 'machine-andlersrv', hostname: 'andlersrv' }];
});

// ─── Mock drizzle-orm ───────────────────────────────────────────
mock.module('drizzle-orm', () => ({
  eq: (left: any, right: any) => ({ __eq: right, __leftName: left?.name }),
  and: (...conds: any[]) => ({ __and: conds }),
}));

// ─── Mock db/index ──────────────────────────────────────────────
mock.module('../../db/index', () => {
  let _lastEq: any = null;
  let _lastAnd: any[] | null = null;

  function resolveTableName(table: any): string {
    const sym = (table as any)?.[Symbol.for('drizzle:Name')];
    if (sym) return String(sym);
    if (typeof table === 'string') return table;
    if (table?.name && typeof table.name === 'string') return table.name;
    return String(table);
  }

  function storeFor(table: any): any[] {
    const name = resolveTableName(table);
    if (name.includes('machine_flag') || name === 'machineFlags') return machineFlagsStore;
    if (name.includes('machine') || name === 'machines') return machinesStore;
    return flagsStore;
  }

  function matches(cond: any, item: any): boolean {
    if (cond?.__eq !== undefined) {
      // eq(column, value) — match by the value against any field
      return Object.values(item).some((v: any) => v === cond.__eq);
    }
    if (cond?.__and) {
      return cond.__and.every((c: any) => matches(c, item));
    }
    return true;
  }

  function makeSelect() {
    return {
      from(table: any) {
        const store = storeFor(table);
        return {
          all() { return [...store]; },
          where(condition: any) {
            const filtered = store.filter((item) => matches(condition, item));
            return {
              all() { return [...filtered]; },
              get() { return filtered.length > 0 ? filtered[0] : null; },
            };
          },
        };
      },
    };
  }

  return { db: { select: makeSelect } };
});

// ─── Mock res/req ───────────────────────────────────────────────

function createMockRes() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    writeHead(code: number, headers: Record<string, string>) {
      this.statusCode = code;
      this.headers = headers;
    },
    end(data: string) { this.body = data; },
  };
}

function createMockReq() {
  return {
    headers: {},
    on(event: string, cb: Function) { if (event === 'end') cb(); return this; },
  };
}

function getJson(res: any): any {
  return JSON.parse(res.body);
}

let handleFlagsRoutes: any;

beforeAll(async () => {
  const mod = await import('../flags');
  handleFlagsRoutes = mod.handleFlagsRoutes;
});

// ─── Tests ──────────────────────────────────────────────────────

describe('GET /v1/machines/:id/flags — merged view (F2/F3)', () => {
  it('returns all predefined flags in document order', async () => {
    flagsStore = [
      { id: 'f1', key: 'llm_interception_enabled', value: 'true', description: 'd1', enabled: true, createdBy: 'system', createdAt: new Date(), updatedAt: new Date() },
      { id: 'f2', key: 'auto_stop_threshold', value: '0.85', description: 'd2', enabled: true, createdBy: 'system', createdAt: new Date(), updatedAt: new Date() },
      { id: 'f3', key: 'damage_logging_level', value: 'standard', description: 'd3', enabled: true, createdBy: 'system', createdAt: new Date(), updatedAt: new Date() },
      { id: 'f4', key: 'alert_on_critical_score', value: 'true', description: 'd4', enabled: true, createdBy: 'system', createdAt: new Date(), updatedAt: new Date() },
      { id: 'f5', key: 'request_sampling_rate', value: '1.0', description: 'd5', enabled: true, createdBy: 'system', createdAt: new Date(), updatedAt: new Date() },
      { id: 'f6', key: 'kill.authorization.mode', value: 'true', description: 'd6', enabled: true, createdBy: 'system', createdAt: new Date(), updatedAt: new Date() },
      { id: 'f7', key: 'kill.authorization.quorum', value: 'true', description: 'd7', enabled: true, createdBy: 'system', createdAt: new Date(), updatedAt: new Date() },
      { id: 'f8', key: 'kill.authorization.timeoutMs', value: 'true', description: 'd8', enabled: true, createdBy: 'system', createdAt: new Date(), updatedAt: new Date() },
    ];

    const res = createMockRes();
    const req = createMockReq();
    const handled = await handleFlagsRoutes('GET', '/v1/machines/machine-andlersrv/flags', req, res, 'admin', 'admin');

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const body = getJson(res);
    expect(body.flags.map((f: any) => f.key)).toEqual([
      'llm_interception_enabled',
      'auto_stop_threshold',
      'damage_logging_level',
      'alert_on_critical_score',
      'request_sampling_rate',
      'kill.authorization.mode',
      'kill.authorization.quorum',
      'kill.authorization.timeoutMs',
    ]);
    // F3 regression: auto_stop_threshold present with coerced number
    const autoStop = body.flags.find((f: any) => f.key === 'auto_stop_threshold');
    expect(autoStop).toBeDefined();
    expect(autoStop.value).toBe(0.85);
    expect(autoStop.type).toBe('number');
  });

  it('does not silently drop a flag whose value fails coercion (F3)', async () => {
    // Legacy boolean 'true' stored for a number-typed flag — must still appear
    // (surfaced raw instead of dropped).
    flagsStore = [
      { id: 'f2', key: 'auto_stop_threshold', value: 'true', description: 'd2', enabled: true, createdBy: 'system', createdAt: new Date(), updatedAt: new Date() },
    ];

    const res = createMockRes();
    const req = createMockReq();
    const handled = await handleFlagsRoutes('GET', '/v1/machines/machine-andlersrv/flags', req, res, 'admin', 'admin');

    expect(handled).toBe(true);
    const body = getJson(res);
    const autoStop = body.flags.find((f: any) => f.key === 'auto_stop_threshold');
    expect(autoStop).toBeDefined();
    expect(autoStop.value).toBe('true'); // raw surfaced, not dropped
  });

  it('includes custom global flags not in the predefined list (F2)', async () => {
    flagsStore = [
      { id: 'f1', key: 'llm_interception_enabled', value: 'true', description: 'd1', enabled: true, createdBy: 'system', createdAt: new Date(), updatedAt: new Date() },
      { id: 'f9', key: 'custom_rollout', value: '0.5', description: 'custom', enabled: true, createdBy: 'admin', createdAt: new Date(), updatedAt: new Date() },
    ];

    const res = createMockRes();
    const req = createMockReq();
    const handled = await handleFlagsRoutes('GET', '/v1/machines/machine-andlersrv/flags', req, res, 'admin', 'admin');

    expect(handled).toBe(true);
    const body = getJson(res);
    const keys = body.flags.map((f: any) => f.key);
    expect(keys).toContain('custom_rollout');
    const custom = body.flags.find((f: any) => f.key === 'custom_rollout');
    expect(custom.value).toBe(0.5);
    expect(custom.type).toBe('number');
  });

  it('surfaces overrides for predefined flags with overridden=true', async () => {
    flagsStore = [
      { id: 'f1', key: 'llm_interception_enabled', value: 'true', description: 'd1', enabled: true, createdBy: 'system', createdAt: new Date(), updatedAt: new Date() },
    ];
    machineFlagsStore = [
      { machineId: 'machine-andlersrv', flagKey: 'llm_interception_enabled', value: 'false', updatedAt: new Date() },
    ];

    const res = createMockRes();
    const req = createMockReq();
    const handled = await handleFlagsRoutes('GET', '/v1/machines/machine-andlersrv/flags', req, res, 'admin', 'admin');

    expect(handled).toBe(true);
    const body = getJson(res);
    const interception = body.flags.find((f: any) => f.key === 'llm_interception_enabled');
    expect(interception.overridden).toBe(true);
    expect(interception.value).toBe(false);
    expect(body.overrides.length).toBe(1);
  });

  it('surfaces orphan overrides (flag deleted, override remains) (F2)', async () => {
    machineFlagsStore = [
      { machineId: 'machine-andlersrv', flagKey: 'deleted_flag_key', value: 'true', updatedAt: new Date() },
    ];

    const res = createMockRes();
    const req = createMockReq();
    const handled = await handleFlagsRoutes('GET', '/v1/machines/machine-andlersrv/flags', req, res, 'admin', 'admin');

    expect(handled).toBe(true);
    const body = getJson(res);
    const orphan = body.flags.find((f: any) => f.key === 'deleted_flag_key');
    expect(orphan).toBeDefined();
    expect(orphan.overridden).toBe(true);
    expect(orphan.value).toBe(true);
  });

  it('returns 404 for unknown machine', async () => {
    const res = createMockRes();
    const req = createMockReq();
    const handled = await handleFlagsRoutes('GET', '/v1/machines/ghost/flags', req, res, 'admin', 'admin');

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(404);
    expect(getJson(res).error).toContain('Machine not found');
  });
});

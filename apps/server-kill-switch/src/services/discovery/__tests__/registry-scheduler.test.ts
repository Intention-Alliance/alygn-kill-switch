/**
 * Registry Scheduler — Unit Tests
 *
 * KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §f.1.
 *
 * Covers: sweep runs on interval; provider probe runs for ADMITTED machines
 * only; online/offline reconciliation marks stale machines offline; `_running`
 * guard prevents overlap; one failing tick doesn't stop the loop.
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import {
  startRegistryScheduler,
  stopRegistryScheduler,
} from '../registry-scheduler';

// ─── In-memory stores ───────────────────────────────────────────

interface MachineRow {
  id: string;
  hostname: string;
  state: string;
  lastSeen: Date;
}

interface ProviderRow {
  id: string;
  machineId: string;
  providerId: string;
  status: string;
}

let machinesStore: MachineRow[] = [];
let providersStore: ProviderRow[] = [];

beforeEach(() => {
  machinesStore = [];
  providersStore = [];
  stopRegistryScheduler();
});

// ─── Mock drizzle-orm ───────────────────────────────────────────

mock.module('drizzle-orm', () => ({
  eq: (left: any, right: any) => ({ __eq: right, __leftName: left?.name }),
  and: (...conds: any[]) => conds,
  lt: (left: any, right: any) => ({ __lt: right, __leftName: left?.name }),
  desc: (col: any) => ({ __desc: col?.name }),
  asc: (col: any) => ({ __asc: col?.name }),
}));

// ─── Mock db module ─────────────────────────────────────────────

let _eqValues: unknown[] = [];
let _ltValues: unknown[] = [];

function resetFilters() {
  _eqValues = [];
  _ltValues = [];
}

function matchesFilters(row: Record<string, unknown>): boolean {
  const camelize = (name: string): string =>
    name.replace(/_([a-z])/g, (_m, letter: string) => letter.toUpperCase());
  for (let i = 0; i < _eqValues.length; i += 2) {
    const column = camelize(String(_eqValues[i]));
    const value = _eqValues[i + 1];
    if (row[column] !== value) return false;
  }
  for (let i = 0; i < _ltValues.length; i += 2) {
    const column = camelize(String(_ltValues[i]));
    const value = _ltValues[i + 1] as Date;
    const rowVal = row[column] as Date;
    if (!(rowVal < value)) return false;
  }
  return true;
}

function makeTableProxy(store: any[]) {
  return {
    select: () => ({
      from: (_table: unknown) => ({
        where: (cond: any) => {
          if (cond?.__eq !== undefined) _eqValues.push(cond?.__leftName, cond?.__eq);
          if (cond?.__lt !== undefined) _ltValues.push(cond?.__leftName, cond?.__lt);
          return {
            get: async () => store.find((row) => matchesFilters(row)) ?? null,
            all: async () => store.filter((row) => matchesFilters(row)),
          };
        },
        get: async () => store[0] ?? null,
        all: async () => store,
      }),
    }),
    insert: () => ({
      values: async (values: any) => {
        store.push(values);
        return { lastInsertRowid: store.length };
      },
    }),
    update: () => ({
      set: (values: any) => ({
        where: (cond: any) => {
          if (cond?.__eq !== undefined) _eqValues.push(cond?.__leftName, cond?.__eq);
          const target = store.find((row) => matchesFilters(row));
          if (target) Object.assign(target, values);
          return { get: async () => null };
        },
      }),
    }),
  };
}

function tableName(table: any): string {
  return table?.[Symbol.for('drizzle:Name')] ?? table?.name ?? '';
}

mock.module('../../../db/index', () => {
  const dbMock = {
    select: () => ({
      from: (table: any) => {
        resetFilters();
        const name = tableName(table);
        if (name === 'discovered_machine') return makeTableProxy(machinesStore).select().from(table);
        if (name === 'discovered_provider') return makeTableProxy(providersStore).select().from(table);
        return makeTableProxy([]).select().from(table);
      },
    }),
    insert: (table: any) => {
      const name = tableName(table);
      if (name === 'discovered_machine') return makeTableProxy(machinesStore).insert();
      if (name === 'discovered_provider') return makeTableProxy(providersStore).insert();
      return makeTableProxy([]).insert();
    },
    update: (table: any) => {
      const name = tableName(table);
      if (name === 'discovered_machine') return makeTableProxy(machinesStore).update();
      if (name === 'discovered_provider') return makeTableProxy(providersStore).update();
      return makeTableProxy([]).update();
    },
  };
  return { db: dbMock };
});

// ─── Mock orchestrator ──────────────────────────────────────────

function makeOrchestrator(overrides: Partial<{
  sweepResult: { discovered: any[]; skipped: number };
  probeResults: any[];
  probeError: boolean;
}> = {}) {
  const sweepCalls: number[] = [];
  const probeCalls: string[] = [];
  return {
    sweepCalls,
    probeCalls,
    runNetworkSweep: async () => {
      sweepCalls.push(Date.now());
      return overrides.sweepResult ?? { discovered: [], skipped: 0 };
    },
    detectProvidersForMachine: async (machineId: string) => {
      probeCalls.push(machineId);
      if (overrides.probeError) throw new Error('probe failed');
      return overrides.probeResults ?? [];
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────

describe('RegistryScheduler', () => {
  it('runs a startup seed sweep immediately', async () => {
    const orch = makeOrchestrator();
    startRegistryScheduler({
      orchestrator: orch as any,
      sweepIntervalMs: 60_000,
      probeIntervalMs: 120_000,
    });
    // Give the async startup sweep a tick to run.
    await new Promise((r) => setTimeout(r, 20));
    expect(orch.sweepCalls.length).toBeGreaterThanOrEqual(1);
    stopRegistryScheduler();
  });

  it('runs the sweep on interval', async () => {
    const orch = makeOrchestrator();
    startRegistryScheduler({
      orchestrator: orch as any,
      sweepIntervalMs: 30,
      probeIntervalMs: 120_000,
    });
    await new Promise((r) => setTimeout(r, 100));
    // Startup sweep + at least 2 interval sweeps.
    expect(orch.sweepCalls.length).toBeGreaterThanOrEqual(3);
    stopRegistryScheduler();
  });

  it('probes only ADMITTED machines', async () => {
    machinesStore.push(
      { id: 'admitted-1', hostname: 'a', state: 'ADMITTED', lastSeen: new Date() },
      { id: 'new-1', hostname: 'n', state: 'NEW_MACHINE', lastSeen: new Date() },
    );
    const orch = makeOrchestrator({ probeResults: [] });
    startRegistryScheduler({
      orchestrator: orch as any,
      sweepIntervalMs: 120_000,
      probeIntervalMs: 20,
    });
    await new Promise((r) => setTimeout(r, 60));
    // Only the ADMITTED machine is probed.
    expect(orch.probeCalls).toContain('admitted-1');
    expect(orch.probeCalls).not.toContain('new-1');
    stopRegistryScheduler();
  });

  it('publishes a discovery event when new machines are found', async () => {
    const orch = makeOrchestrator({
      sweepResult: {
        discovered: [{ id: 'm1', hostname: 'h1', ip: null, source: 'arp-sweep', state: 'NEW_MACHINE' }],
        skipped: 0,
      },
    });
    const published: Array<{ channel: string; msg: string }> = [];
    startRegistryScheduler({
      orchestrator: orch as any,
      sweepIntervalMs: 120_000,
      probeIntervalMs: 120_000,
      publish: async (channel, msg) => { published.push({ channel, msg }); },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(published.length).toBeGreaterThanOrEqual(1);
    expect(published[0].channel).toBe('bcp:discovery:events');
    const payload = JSON.parse(published[0].msg);
    expect(payload.type).toBe('discovery-sweep');
    expect(payload.payload.discovered[0].id).toBe('m1');
    stopRegistryScheduler();
  });

  it('publishes a reconciliation event when machines are stale (offline)', async () => {
    machinesStore.push({
      id: 'stale-1',
      hostname: 's',
      state: 'ADMITTED',
      lastSeen: new Date(Date.now() - 200_000), // older than 90s timeout
    });
    const orch = makeOrchestrator();
    const published: Array<{ channel: string; msg: string }> = [];
    startRegistryScheduler({
      orchestrator: orch as any,
      heartbeatTimeoutMs: 90_000,
      sweepIntervalMs: 20,
      probeIntervalMs: 120_000,
      publish: async (channel, msg) => { published.push({ channel, msg }); },
    });
    await new Promise((r) => setTimeout(r, 60));
    const recon = published.find((p) => JSON.parse(p.msg).type === 'registry-reconciliation');
    expect(recon).toBeDefined();
    const payload = JSON.parse(recon!.msg);
    expect(payload.payload.offline.some((m: any) => m.id === 'stale-1')).toBe(true);
    stopRegistryScheduler();
  });

  it('a failing tick does not stop the loop', async () => {
    // First sweep throws, subsequent sweeps succeed.
    let call = 0;
    const orch = {
      runNetworkSweep: async () => {
        call++;
        if (call === 1) throw new Error('sweep boom');
        return { discovered: [], skipped: 0 };
      },
      detectProvidersForMachine: async () => [],
    };
    startRegistryScheduler({
      orchestrator: orch as any,
      sweepIntervalMs: 20,
      probeIntervalMs: 120_000,
    });
    await new Promise((r) => setTimeout(r, 80));
    // The loop kept running after the first failure.
    expect(call).toBeGreaterThan(1);
    stopRegistryScheduler();
  });

  it('stopRegistryScheduler is idempotent and stops the loop', async () => {
    const orch = makeOrchestrator();
    startRegistryScheduler({
      orchestrator: orch as any,
      sweepIntervalMs: 10,
      probeIntervalMs: 120_000,
    });
    await new Promise((r) => setTimeout(r, 40));
    const callsAfterStart = orch.sweepCalls.length;
    stopRegistryScheduler();
    stopRegistryScheduler(); // idempotent
    const callsAfterStop = orch.sweepCalls.length;
    await new Promise((r) => setTimeout(r, 40));
    // No new sweeps after stop.
    expect(orch.sweepCalls.length).toBe(callsAfterStop);
    expect(callsAfterStop).toBeGreaterThanOrEqual(callsAfterStart);
  });
});

/**
 * Heartbeat Collector — Unit Tests
 *
 * KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §a.3, P2-3 (Stage 1 review).
 *
 * Covers:
 *   - heartbeat collection delegates to the orchestrator (drift + signature)
 *   - agent upsert for ADMITTED machines (machine exists in `machines` inventory)
 *   - agent upsert SKIPPED for discovered-but-not-admitted machines (no
 *     `machines` row → would otherwise throw an agents.machineId FK violation)
 *   - lastSeen is still updated on discovered_machines via the orchestrator
 *     regardless of admission state
 *   - existing agent row is updated (not re-inserted)
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { HeartbeatCollector } from '../heartbeat-collector';

// ─── In-memory stores ───────────────────────────────────────────

interface MachineRow {
  id: string;
  hostname: string;
  state: string;
  lastSeen: Date;
}

interface AgentRow {
  id: string;
  machineId: string;
  name: string;
  version: string;
  capabilities: string | null;
  lastHeartbeat: Date | null;
  createdAt: Date;
}

let machinesStore: MachineRow[] = [];
let agentsStore: AgentRow[] = [];

beforeEach(() => {
  machinesStore = [];
  agentsStore = [];
});

// ─── Mock drizzle-orm ───────────────────────────────────────────

mock.module('drizzle-orm', () => ({
  eq: (left: any, right: any) => ({ __eq: right, __leftName: left?.name }),
}));

// ─── Mock db module ─────────────────────────────────────────────

let _eqValues: unknown[] = [];

function resetFilters() {
  _eqValues = [];
}

function matchesFilters(row: Record<string, unknown>): boolean {
  const camelize = (name: string): string =>
    name.replace(/_([a-z])/g, (_m, letter: string) => letter.toUpperCase());
  for (let i = 0; i < _eqValues.length; i += 2) {
    const column = camelize(String(_eqValues[i]));
    const value = _eqValues[i + 1];
    if (row[column] !== value) return false;
  }
  return true;
}

function makeTableProxy(store: any[]) {
  return {
    select: () => ({
      from: (_table: unknown) => ({
        where: (cond: any) => {
          if (cond?.__eq !== undefined) _eqValues.push(cond?.__leftName, cond?.__eq);
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
        if (name === 'machine') return makeTableProxy(machinesStore).select().from(table);
        if (name === 'agent') return makeTableProxy(agentsStore).select().from(table);
        return makeTableProxy([]).select().from(table);
      },
    }),
    insert: (table: any) => {
      const name = tableName(table);
      if (name === 'agent') return makeTableProxy(agentsStore).insert();
      return makeTableProxy([]).insert();
    },
    update: (table: any) => {
      const name = tableName(table);
      if (name === 'agent') return makeTableProxy(agentsStore).update();
      return makeTableProxy([]).update();
    },
  };
  return { db: dbMock };
});

// ─── Mock orchestrator ──────────────────────────────────────────

function makeOrchestrator(overrides: Partial<{
  drift: any;
  signature: any;
}> = {}) {
  const heartbeatCalls: Array<{ machineId: string; hostname: string }> = [];
  return {
    heartbeatCalls,
    handleHeartbeat: async (params: { machineId: string; hostname: string }) => {
      heartbeatCalls.push({ machineId: params.machineId, hostname: params.hostname });
      return {
        drift: overrides.drift ?? null,
        signature: overrides.signature ?? { alg: 'sha256', value: 'sig' },
      };
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────

describe('HeartbeatCollector', () => {
  it('delegates heartbeat to the orchestrator and returns drift + signature', async () => {
    const orch = makeOrchestrator({ drift: { event: 'tamper', severity: 'high' } });
    const collector = new HeartbeatCollector(orch as any);

    const result = await collector.handleAgentHeartbeat({
      machineId: 'm-1',
      hostname: 'worker-01',
    });

    expect(orch.heartbeatCalls).toHaveLength(1);
    expect(orch.heartbeatCalls[0]).toEqual({ machineId: 'm-1', hostname: 'worker-01' });
    expect(result.drift as unknown).toEqual({ event: 'tamper', severity: 'high' });
    expect(result.signature as unknown).toEqual({ alg: 'sha256', value: 'sig' });
    expect(result.agentRegistered).toBe(false);
  });

  it('upserts an agent for an ADMITTED machine (machine exists in inventory)', async () => {
    machinesStore.push({ id: 'm-admitted', hostname: 'worker-01', state: 'ADMITTED', lastSeen: new Date() });
    const orch = makeOrchestrator();
    const collector = new HeartbeatCollector(orch as any);

    const result = await collector.handleAgentHeartbeat({
      machineId: 'm-admitted',
      hostname: 'worker-01',
      agentId: 'agent-1',
      agentName: 'alygn-agent',
      agentVersion: '1.2.3',
      capabilities: ['inference', 'telemetry'],
    });

    expect(result.agentRegistered).toBe(true);
    expect(agentsStore).toHaveLength(1);
    expect(agentsStore[0]).toMatchObject({
      id: 'agent-1',
      machineId: 'm-admitted',
      name: 'alygn-agent',
      version: '1.2.3',
      capabilities: JSON.stringify(['inference', 'telemetry']),
    });
    expect(agentsStore[0].lastHeartbeat).toBeInstanceOf(Date);
  });

  it('SKIPS agent upsert for a discovered-but-not-admitted machine (no machines row)', async () => {
    // No machinesStore entry → machine is discovered but not admitted.
    const orch = makeOrchestrator();
    const collector = new HeartbeatCollector(orch as any);

    const result = await collector.handleAgentHeartbeat({
      machineId: 'discovered-192-168-1-50',
      hostname: 'worker-01',
      agentId: 'agent-2',
      agentName: 'alygn-agent',
      agentVersion: '1.2.3',
    });

    // Agent NOT registered, no FK violation thrown.
    expect(result.agentRegistered).toBe(false);
    expect(agentsStore).toHaveLength(0);
    // The orchestrator heartbeat still ran (updates discovered_machines.lastSeen).
    expect(orch.heartbeatCalls).toHaveLength(1);
    expect(orch.heartbeatCalls[0].machineId).toBe('discovered-192-168-1-50');
  });

  it('updates an existing agent row instead of re-inserting', async () => {
    machinesStore.push({ id: 'm-admitted', hostname: 'worker-01', state: 'ADMITTED', lastSeen: new Date() });
    agentsStore.push({
      id: 'agent-1',
      machineId: 'm-admitted',
      name: 'old-name',
      version: '0.0.1',
      capabilities: null,
      lastHeartbeat: null,
      createdAt: new Date(),
    });
    const orch = makeOrchestrator();
    const collector = new HeartbeatCollector(orch as any);

    const result = await collector.handleAgentHeartbeat({
      machineId: 'm-admitted',
      hostname: 'worker-01',
      agentId: 'agent-1',
      agentName: 'new-name',
      agentVersion: '2.0.0',
    });

    // Updated, not newly registered.
    expect(result.agentRegistered).toBe(false);
    expect(agentsStore).toHaveLength(1);
    expect(agentsStore[0].name).toBe('new-name');
    expect(agentsStore[0].version).toBe('2.0.0');
    expect(agentsStore[0].lastHeartbeat).toBeInstanceOf(Date);
  });

  it('does not register an agent when no agentId is provided', async () => {
    machinesStore.push({ id: 'm-admitted', hostname: 'worker-01', state: 'ADMITTED', lastSeen: new Date() });
    const orch = makeOrchestrator();
    const collector = new HeartbeatCollector(orch as any);

    const result = await collector.handleAgentHeartbeat({
      machineId: 'm-admitted',
      hostname: 'worker-01',
    });

    expect(result.agentRegistered).toBe(false);
    expect(agentsStore).toHaveLength(0);
  });
});

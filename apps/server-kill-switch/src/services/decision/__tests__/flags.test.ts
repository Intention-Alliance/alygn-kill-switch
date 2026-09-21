/**
 * Decision flags reader — resolution order (S3).
 *
 * The db module is mocked so the reader can be tested without SQLite.
 * Table identity comes from the real schema (schema.ts does not import db,
 * so importing it here is safe).
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { machineFlags as realMachineFlags, featureFlags as realFeatureFlags } from '../../../db/schema';

let globalRow: any = null;
let overrideRow: any = null;

function chainable(rowGetter: () => any) {
  const chain: any = {
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    offset: () => chain,
    get: async () => rowGetter(),
    all: async () => {
      const r = rowGetter();
      return r ? [r] : [];
    },
  };
  return chain;
}

// Mock by absolute path — Bun resolves the specifier the same way flags.ts does.
mock.module('/tmp/jev-flags/apps/server-kill-switch/src/db/index.ts', () => ({
  db: {
    select: () => ({
      from: (table: any) => {
        if (table === realMachineFlags) return chainable(() => overrideRow);
        if (table === realFeatureFlags) return chainable(() => globalRow);
        return chainable(() => null);
      },
    }),
  },
}));

const { readDecisionFlags } = await import('../flags');

beforeEach(() => {
  globalRow = null;
  overrideRow = null;
});

describe('readDecisionFlags', () => {
  it('falls back to declared defaults when nothing is stored', async () => {
    const f = await readDecisionFlags('m1');
    expect(f.getFlag('decision.provider')).toBe('keyword');
    expect(f.getFlag('decision.jev.timeoutMs')).toBe(500);
    expect(f.getFlag('decision.review_threshold')).toBe(0.6);
    expect(f.getFlag('decision.jev.model')).toBe('jev-latest');
  });

  it('global row beats the declared default', async () => {
    globalRow = { key: 'decision.provider', value: 'jev' };
    const f = await readDecisionFlags('m1');
    expect(f.getFlag('decision.provider')).toBe('jev');
  });

  it('machine override beats the global row', async () => {
    globalRow = { key: 'decision.provider', value: 'keyword' };
    overrideRow = { machineId: 'm1', flagKey: 'decision.provider', value: 'ollama' };
    const f = await readDecisionFlags('m1');
    expect(f.getFlag('decision.provider')).toBe('ollama');
  });

  it('coerces a numeric flag to a number', async () => {
    globalRow = { key: 'decision.jev.timeoutMs', value: '750' };
    const f = await readDecisionFlags('m1');
    expect(f.getFlag('decision.jev.timeoutMs')).toBe(750);
  });

  it('falls back to the default for an unparseable numeric value', async () => {
    globalRow = { key: 'decision.review_threshold', value: 'not-a-number' };
    const f = await readDecisionFlags('m1');
    expect(f.getFlag('decision.review_threshold')).toBe(0.6);
  });

  it('never throws and returns null for an unknown key', async () => {
    const f = await readDecisionFlags('m1');
    expect(f.getFlag('nope')).toBeNull();
  });
});

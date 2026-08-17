/**
 * Kill Authorization Service — Quorum Workflow Tests (ADR-136)
 *
 * Covers:
 *   - single mode: one assertion → EXECUTE
 *   - quorum mode: assertion #1 → PENDING_QUORUM → assertion #2 → EXECUTE
 *   - quorum timeout: request expires
 *   - initiator cannot be sole approver in quorum mode
 *   - quorum-gated policy change: single signature rejected when mode is quorum
 *   - policy change threshold uses CURRENT mode (not proposed)
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';

// ─── In-memory stores ─────────────────────────────────────────────

interface MockRequest {
  id: string;
  action: string;
  target: string;
  initiatedBy: string;
  initiatedByCredentialId: string;
  initiatedAt: Date;
  status: string;
  signatures: string;
  executedAt: Date | null;
  timeoutMs: number;
}

interface MockSetting {
  key: string;
  value: string;
  updatedAt: Date;
}

let requestStore: MockRequest[] = [];
let settingStore: MockSetting[] = [];

// When true, the next db.transaction() callback runs and then the
// transaction "rolls back" — all stores are restored to their pre-
// transaction snapshots and the transaction rejects. Lets tests assert
// that approve() is atomic: an executor failure leaves the request
// PENDING_QUORUM (not EXECUTED) so a retry can re-attempt.
let rollbackNextTransaction = false;

function setSetting(key: string, value: string) {
  const existing = settingStore.find((s) => s.key === key);
  if (existing) existing.value = value;
  else settingStore.push({ key, value, updatedAt: new Date() });
}

beforeEach(() => {
  requestStore = [];
  settingStore = [];
  rollbackNextTransaction = false;
  // Defaults per ADR-136: single mode, quorum 2, timeout 10 min
  setSetting('kill.authorization.mode', 'single');
  setSetting('kill.authorization.quorum', '2');
  setSetting('kill.authorization.timeoutMs', '600000');
});

// ─── Mock drizzle-orm ─────────────────────────────────────────────

mock.module('drizzle-orm', () => ({
  eq: (left: any, right: any) => ({ __eq: right, __leftName: left?.name }),
  and: (...args: any[]) => ({ __and: args }),
}));

// ─── Mock db/index ────────────────────────────────────────────────

mock.module('../../db/index', () => {
  function resolveTableName(table: any): string {
    const sym = (table as any)?.[Symbol.for('drizzle:Name')];
    if (sym) return String(sym);
    if (typeof table === 'string') return table;
    if (table?.name && typeof table.name === 'string') return table.name;
    return String(table);
  }

  function makeSelect() {
    return {
      from(table: any) {
        const tableName = resolveTableName(table);
        const isRequest = tableName.includes('kill_authorization_request');
        const isSetting = tableName.includes('setting');
        const store = isRequest ? requestStore : isSetting ? settingStore : [];

        return {
          all() {
            return [...store];
          },
          where(condition: any) {
            let eqValue: any = condition?.__eq ?? null;
            if (eqValue === null && Array.isArray(condition?.__and)) {
              for (const sub of condition.__and) {
                if (sub?.__eq !== undefined) eqValue = sub.__eq;
              }
            }
            const filtered = eqValue !== null
              ? store.filter((r: any) => r.id === eqValue || r.key === eqValue || r.status === eqValue)
              : [...store];
            return {
              all() { return filtered; },
              get() { return filtered.length > 0 ? filtered[0] : null; },
            };
          },
          orderBy() {
            return { limit() { return { all() { return [...store]; } }; } };
          },
          limit() {
            return { all() { return [...store]; } };
          },
        };
      },
    };
  }

  function makeInsert() {
    return {
      values(data: any) {
        return {
          run() {
            if (data.id && data.action) {
              requestStore.push({
                id: data.id,
                action: data.action,
                target: data.target,
                initiatedBy: data.initiatedBy,
                initiatedByCredentialId: data.initiatedByCredentialId,
                initiatedAt: data.initiatedAt ?? new Date(),
                status: data.status ?? 'PENDING_QUORUM',
                signatures: data.signatures ?? '[]',
                executedAt: data.executedAt ?? null,
                timeoutMs: data.timeoutMs ?? 600000,
              });
            } else if (data.key) {
              settingStore.push({
                key: data.key,
                value: data.value,
                updatedAt: data.updatedAt ?? new Date(),
              });
            }
          },
        };
      },
    };
  }

  function makeUpdate() {
    return {
      set(updates: any) {
        return {
          where(condition: any) {
            const eqValue = condition?.__eq ?? null;
            return {
              run() {
                const idx = requestStore.findIndex((r) => r.id === eqValue);
                if (idx >= 0) {
                  requestStore[idx] = { ...requestStore[idx], ...updates };
                }
              },
            };
          },
        };
      },
    };
  }

  // The mock db object. Annotated explicitly so the self-referential
  // `transaction` callback type (which receives the mock db as `tx`)
  // doesn't trigger TS7022 (implicit circular type inference).
  interface MockDb {
    select: typeof makeSelect;
    insert: typeof makeInsert;
    update: typeof makeUpdate;
    transaction: (cb: (tx: MockDb) => Promise<unknown>) => Promise<unknown>;
  }

  const dbMock: MockDb = {
    select: makeSelect,
    insert: makeInsert,
    update: makeUpdate,
    // ADR-136 atomicity: approve() runs the status update + executor
    // side-effect inside a transaction. The mock executes the callback
    // against the same in-memory db object so reads/writes share the
    // same stores. When rollbackNextTransaction is set, the stores are
    // restored to their pre-transaction state and the transaction
    // rejects — simulating a rolled-back approve (executor failure).
    transaction: async (cb: (tx: MockDb) => Promise<unknown>) => {
      const snapshot = {
        requests: requestStore.map((r) => ({ ...r })),
        settings: settingStore.map((s) => ({ ...s })),
      };
      try {
        const result = await cb(dbMock);
        if (rollbackNextTransaction) {
          rollbackNextTransaction = false;
          requestStore = snapshot.requests;
          settingStore = snapshot.settings;
          throw new Error('transaction rolled back');
        }
        return result;
      } catch (e) {
        // Any throw inside the callback (e.g. executor failure) rolls the
        // transaction back — stores are restored to their pre-transaction
        // state, mirroring real SQLite rollback semantics.
        requestStore = snapshot.requests;
        settingStore = snapshot.settings;
        throw e;
      }
    },
  };
  return { db: dbMock };
});

// ─── Import service after mocks ───────────────────────────────────

let killAuth: any;
let KillAuthorizationError: any;

beforeEach(async () => {
  const mod = await import('../../services/kill-authorization');
  killAuth = mod;
  KillAuthorizationError = mod.KillAuthorizationError;
});

// ─── Test executor ────────────────────────────────────────────────

function createExecutor() {
  const calls: { kind: string; params: any }[] = [];
  return {
    calls,
    executor: {
      async executeKill(params: any) {
        calls.push({ kind: 'executeKill', params });
        return { ok: true };
      },
      async applyPolicyChange(params: any) {
        calls.push({ kind: 'applyPolicyChange', params });
        return { ok: true };
      },
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────

describe('KillAuthorizationService — single mode', () => {
  it('single mode: one assertion → EXECUTE immediately', async () => {
    setSetting('kill.authorization.mode', 'single');
    const { executor, calls } = createExecutor();

    const result = await killAuth.initiateKill(
      {
        action: 'kill',
        target: 'machine-1',
        state: 'STOPPED',
        reason: 'test kill',
        userId: 'human-a',
        credentialId: 'cred-a',
        ip: '10.0.0.1',
      },
      executor,
    );

    expect(result.mode).toBe('single');
    expect(result.executed).toBe(true);
    expect(result.request.status).toBe('EXECUTED');
    expect(result.request.signatures.length).toBe(1);
    expect(calls.length).toBe(1);
    expect(calls[0].kind).toBe('executeKill');
    expect(calls[0].params.state).toBe('STOPPED');
    expect(calls[0].params.userId).toBe('human-a');
  });
});

describe('KillAuthorizationService — quorum mode', () => {
  it('quorum: assertion #1 → PENDING_QUORUM, assertion #2 → EXECUTE', async () => {
    setSetting('kill.authorization.mode', 'quorum');
    const { executor, calls } = createExecutor();

    const initiated = await killAuth.initiateKill(
      {
        action: 'kill',
        target: 'fleet',
        state: 'STOPPED',
        reason: 'fleet kill',
        userId: 'human-a',
        credentialId: 'cred-a',
      },
      executor,
    );

    expect(initiated.mode).toBe('quorum');
    expect(initiated.executed).toBe(false);
    expect(initiated.request.status).toBe('PENDING_QUORUM');
    expect(calls.length).toBe(0); // nothing executed yet

    // Human B approves → threshold met (2 distinct) → EXECUTE
    const approved = await killAuth.approve(
      { requestId: initiated.request.id, userId: 'human-b', credentialId: 'cred-b' },
      executor,
    );

    expect(approved.executed).toBe(true);
    expect(approved.request.status).toBe('EXECUTED');
    expect(approved.request.signatures.length).toBe(2);
    expect(calls.length).toBe(1);
    expect(calls[0].kind).toBe('executeKill');
    expect(calls[0].params.state).toBe('STOPPED');
  });

  it('quorum: initiator cannot be sole approver — same human twice does not execute', async () => {
    setSetting('kill.authorization.mode', 'quorum');
    const { executor, calls } = createExecutor();

    const initiated = await killAuth.initiateKill(
      {
        action: 'kill',
        target: 'fleet',
        state: 'STOPPED',
        reason: 'fleet kill',
        userId: 'human-a',
        credentialId: 'cred-a',
      },
      executor,
    );

    // Same human tries to approve with a second credential — still only
    // ONE distinct human → threshold NOT met.
    const approved = await killAuth.approve(
      { requestId: initiated.request.id, userId: 'human-a', credentialId: 'cred-a2' },
      executor,
    );

    expect(approved.executed).toBe(false);
    expect(approved.request.status).toBe('PENDING_QUORUM');
    expect(calls.length).toBe(0);
  });

  it('quorum: same credential cannot sign twice', async () => {
    setSetting('kill.authorization.mode', 'quorum');
    const { executor } = createExecutor();

    const initiated = await killAuth.initiateKill(
      {
        action: 'kill',
        target: 'fleet',
        state: 'STOPPED',
        reason: 'fleet kill',
        userId: 'human-a',
        credentialId: 'cred-a',
      },
      executor,
    );

    await expect(
      killAuth.approve(
        { requestId: initiated.request.id, userId: 'human-a', credentialId: 'cred-a' },
        executor,
      ),
    ).rejects.toThrow();
  });

  it('quorum: executor failure rolls back — request stays PENDING_QUORUM (atomicity)', async () => {
    setSetting('kill.authorization.mode', 'quorum');
    const { executor } = createExecutor();
    // Make the executor throw on the second signature (threshold met).
    executor.executeKill = async () => { throw new Error('kill transition failed'); };

    const initiated = await killAuth.initiateKill(
      {
        action: 'kill',
        target: 'fleet',
        state: 'STOPPED',
        reason: 'fleet kill',
        userId: 'human-a',
        credentialId: 'cred-a',
      },
      executor,
    );

    // Human B approves → threshold met → executor runs inside a
    // transaction. The executor throws → transaction rolls back → the
    // request must NOT be left EXECUTED.
    await expect(
      killAuth.approve(
        { requestId: initiated.request.id, userId: 'human-b', credentialId: 'cred-b' },
        executor,
      ),
    ).rejects.toThrow('kill transition failed');

    const row = requestStore.find((r) => r.id === initiated.request.id)!;
    expect(row.status).toBe('PENDING_QUORUM');
    expect(row.executedAt).toBeNull();
    // Signatures preserved so a retry can re-attempt.
    expect(JSON.parse(row.signatures).length).toBe(1);
  });

  it('quorum: timeout — request expires after timeoutMs', async () => {
    setSetting('kill.authorization.mode', 'quorum');
    setSetting('kill.authorization.timeoutMs', '1000'); // 1s window
    const { executor, calls } = createExecutor();

    const initiated = await killAuth.initiateKill(
      {
        action: 'kill',
        target: 'fleet',
        state: 'STOPPED',
        reason: 'fleet kill',
        userId: 'human-a',
        credentialId: 'cred-a',
      },
      executor,
    );

    // Simulate time passing: backdate the request beyond the timeout.
    const row = requestStore.find((r) => r.id === initiated.request.id)!;
    row.initiatedAt = new Date(Date.now() - 5000);

    await expect(
      killAuth.approve(
        { requestId: initiated.request.id, userId: 'human-b', credentialId: 'cred-b' },
        executor,
      ),
    ).rejects.toThrow('expired');

    expect(calls.length).toBe(0);
    expect(requestStore.find((r) => r.id === initiated.request.id)!.status).toBe('EXPIRED');
  });

  it('quorum: expireStaleRequests marks overdue PENDING_QUORUM as EXPIRED', async () => {
    setSetting('kill.authorization.mode', 'quorum');
    setSetting('kill.authorization.timeoutMs', '1000');
    const { executor } = createExecutor();

    const initiated = await killAuth.initiateKill(
      {
        action: 'kill',
        target: 'fleet',
        state: 'STOPPED',
        reason: 'fleet kill',
        userId: 'human-a',
        credentialId: 'cred-a',
      },
      executor,
    );

    const row = requestStore.find((r) => r.id === initiated.request.id)!;
    row.initiatedAt = new Date(Date.now() - 5000);

    const expired = await killAuth.expireStaleRequests();
    expect(expired).toBe(1);
    expect(requestStore.find((r) => r.id === initiated.request.id)!.status).toBe('EXPIRED');
  });
});

describe('KillAuthorizationService — quorum-gated policy changes (ADR-136 §6)', () => {
  it('policy change in quorum mode: single signature → PENDING_QUORUM (not executed)', async () => {
    setSetting('kill.authorization.mode', 'quorum');
    const { executor, calls } = createExecutor();

    const result = await killAuth.initiatePolicyChange(
      {
        flagKey: 'kill.authorization.mode',
        proposedValue: 'single',
        userId: 'human-a',
        credentialId: 'cred-a',
      },
      executor,
    );

    expect(result.mode).toBe('quorum');
    expect(result.executed).toBe(false);
    expect(result.request.status).toBe('PENDING_QUORUM');
    expect(calls.length).toBe(0);
  });

  it('policy change in quorum mode: second distinct signature → EXECUTED', async () => {
    setSetting('kill.authorization.mode', 'quorum');
    const { executor, calls } = createExecutor();

    const initiated = await killAuth.initiatePolicyChange(
      {
        flagKey: 'kill.authorization.mode',
        proposedValue: 'single',
        userId: 'human-a',
        credentialId: 'cred-a',
      },
      executor,
    );

    const approved = await killAuth.approve(
      { requestId: initiated.request.id, userId: 'human-b', credentialId: 'cred-b' },
      executor,
    );

    expect(approved.executed).toBe(true);
    expect(approved.request.status).toBe('EXECUTED');
    expect(calls.length).toBe(1);
    expect(calls[0].kind).toBe('applyPolicyChange');
    expect(calls[0].params.flagKey).toBe('kill.authorization.mode');
    expect(calls[0].params.value).toBe('single');
  });

  it('policy change in single mode: one signature → EXECUTED', async () => {
    setSetting('kill.authorization.mode', 'single');
    const { executor, calls } = createExecutor();

    const result = await killAuth.initiatePolicyChange(
      {
        flagKey: 'kill.authorization.timeoutMs',
        proposedValue: '300000',
        userId: 'human-a',
        credentialId: 'cred-a',
      },
      executor,
    );

    expect(result.executed).toBe(true);
    expect(result.request.status).toBe('EXECUTED');
    expect(calls.length).toBe(1);
    expect(calls[0].params.value).toBe('300000');
  });

  it('policy change threshold uses CURRENT mode threshold, not proposed', async () => {
    // Current mode is quorum with threshold 2 — even though the proposed
    // change is to mode=single (which would lower the bar), the change
    // itself still requires 2 distinct humans.
    setSetting('kill.authorization.mode', 'quorum');
    setSetting('kill.authorization.quorum', '2');
    const { executor, calls } = createExecutor();

    const initiated = await killAuth.initiatePolicyChange(
      {
        flagKey: 'kill.authorization.mode',
        proposedValue: 'single',
        userId: 'human-a',
        credentialId: 'cred-a',
      },
      executor,
    );

    // One more signature from a DIFFERENT human → executed under quorum rules
    const approved = await killAuth.approve(
      { requestId: initiated.request.id, userId: 'human-b', credentialId: 'cred-b' },
      executor,
    );
    expect(approved.executed).toBe(true);
    expect(calls.length).toBe(1);
  });
});

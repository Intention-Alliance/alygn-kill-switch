/**
 * Tests for LockoutStateMachine
 *
 * Covers:
 *  - Trips at 50 consecutive 401s in 60s window
 *  - Auto-unlocks at 48h
 *  - Resets counter on successful 200
 *  - Persists across restarts (save → load)
 *  - Lockout label formatting
 *  - Events emit correctly
 *
 * @author Keridz ⚙️
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { LockoutStateMachine, THRESHOLD_401_COUNT, WINDOW_MS, AUTO_UNLOCK_MS } from './lockout-state';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const TEST_DIR = resolve(tmpdir(), `lockout-test-${process.pid}-${Date.now()}`);
const TEST_LOCKOUT_PATH = join(TEST_DIR, 'secrets.lockout.json');

async function setupTestDir() {
  await mkdir(TEST_DIR, { recursive: true });
}

async function cleanupTestDir() {
  try { await unlink(TEST_LOCKOUT_PATH).catch(() => {}); } catch {}
}

describe('LockoutStateMachine', () => {
  let machine: LockoutStateMachine;

  beforeEach(async () => {
    await setupTestDir();
    machine = new LockoutStateMachine({ lockoutPath: TEST_LOCKOUT_PATH });
    await machine.load();
  });

  afterEach(async () => {
    machine.stopWatchers();
    await cleanupTestDir();
  });

  it('starts in "ok" state', () => {
    const check = machine.getCheckResult();
    expect(check.state).toBe('ok');
    expect(check.locked).toBe(false);
    expect(check.consecutive401s).toBe(0);
  });

  it('increments counter on 401', async () => {
    await machine.record401('100.64.0.5');
    await machine.record401('100.64.0.5');

    const check = machine.getCheckResult();
    expect(check.consecutive401s).toBe(2);
    expect(check.state).toBe('ok');
    expect(check.last401Source).toBe('100.64.0.5');
  });

  it('trips at 50 consecutive 401s in 60s window', async () => {
    for (let i = 0; i < THRESHOLD_401_COUNT; i++) {
      await machine.record401('100.64.0.5');
    }

    const check = machine.getCheckResult();
    expect(check.state).toBe('locked');
    expect(check.locked).toBe(true);
    expect(check.autoUnlockAt).not.toBeNull();
  });

  it('does not trip at 49 consecutive 401s', async () => {
    for (let i = 0; i < 49; i++) {
      await machine.record401('100.64.0.5');
    }

    const check = machine.getCheckResult();
    expect(check.state).toBe('ok');
    expect(check.locked).toBe(false);
  });

  it('resets counter on successful 200 (when not locked)', async () => {
    for (let i = 0; i < 30; i++) {
      await machine.record401('100.64.0.5');
    }
    expect(machine.getCheckResult().consecutive401s).toBe(30);

    await machine.record200();

    const check = machine.getCheckResult();
    expect(check.consecutive401s).toBe(0);
    expect(check.state).toBe('ok');
  });

  it('does NOT unlock on 200 when already locked', async () => {
    for (let i = 0; i < THRESHOLD_401_COUNT; i++) {
      await machine.record401('100.64.0.5');
    }
    expect(machine.getCheckResult().state).toBe('locked');

    await machine.record200();

    // Should still be locked — only auto-unlock clears it
    const check = machine.getCheckResult();
    expect(check.state).toBe('locked');
    expect(check.locked).toBe(true);
  });

  it('auto-unlocks after 48h', async () => {
    for (let i = 0; i < THRESHOLD_401_COUNT; i++) {
      await machine.record401('100.64.0.5');
    }
    expect(machine.getCheckResult().locked).toBe(true);

    // Simulate time passing 48h + 1s
    const check = machine.getCheckResult();
    expect(check.autoUnlockAt).not.toBeNull();

    // We can't wait 48h, so we manipulate the persisted state
    machine.stopWatchers();
    const manipulated = new LockoutStateMachine({ lockoutPath: TEST_LOCKOUT_PATH });
    await manipulated.load();

    // Force autoUnlockAt to the past
    const state = (manipulated as any).state;
    state.autoUnlockAt = Date.now() - 1000; // 1s ago
    await manipulated.persist();

    // checkAutoUnlock should fire
    const unlocked = manipulated.checkAutoUnlock();
    expect(unlocked).toBe(true);
    expect(manipulated.getCheckResult().state).toBe('ok');
    expect(manipulated.getCheckResult().locked).toBe(false);

    manipulated.stopWatchers();
  });

  it('persists state across restarts', async () => {
    for (let i = 0; i < THRESHOLD_401_COUNT; i++) {
      await machine.record401('100.64.0.5');
    }
    expect(machine.getCheckResult().locked).toBe(true);

    // Stop current, create new — should load persisted state
    machine.stopWatchers();
    const restored = new LockoutStateMachine({ lockoutPath: TEST_LOCKOUT_PATH });
    await restored.load();

    const check = restored.getCheckResult();
    expect(check.state).toBe('locked');
    expect(check.locked).toBe(true);
    expect(check.consecutive401s).toBe(THRESHOLD_401_COUNT);

    restored.stopWatchers();
  });

  it('emits "locked" event when threshold tripped', async () => {
    let locked = false;
    machine.on('locked', () => { locked = true; });

    for (let i = 0; i < THRESHOLD_401_COUNT; i++) {
      await machine.record401('100.64.0.5');
    }

    expect(locked).toBe(true);
  });

  it('emits "unlocked" event on auto-unlock', async () => {
    let unlocked = false;

    // Lock it
    for (let i = 0; i < THRESHOLD_401_COUNT; i++) {
      await machine.record401('100.64.0.5');
    }
    machine.stopWatchers();

    // Manipulate state for past auto-unlock
    const state = (machine as any).state;
    state.autoUnlockAt = Date.now() - 1000;

    machine.on('unlocked', () => { unlocked = true; });

    const result = machine.checkAutoUnlock();
    expect(result).toBe(true);
    expect(unlocked).toBe(true);
  });

  it('returns correct lockout label', async () => {
    expect(machine.getLockoutLabel()).toBe('ok');

    for (let i = 0; i < THRESHOLD_401_COUNT; i++) {
      await machine.record401('100.64.0.5');
    }

    const label = machine.getLockoutLabel();
    expect(label).toMatch(/^auto-unlock-in-\d+h$/);
  });

  it('prunes events outside 60s window', async () => {
    // Record some 401s with old timestamps
    const now = Date.now();
    const state = (machine as any).state;
    state.events = [
      { timestamp: now - 120_000, sourceIp: '100.64.0.5' }, // 2min ago, outside window
      { timestamp: now - 30_000, sourceIp: '100.64.0.5' }, // 30s ago, inside
      { timestamp: now - 10_000, sourceIp: '100.64.0.5' }, // 10s ago, inside
    ];

    // Record a new 401 — should prune the old one
    await machine.record401('100.64.0.5');

    const check = machine.getCheckResult();
    // recent401s should be 3 (2 existing in-window + 1 new), not 4
    expect(check.recent401s).toBe(3);
  });

  it('handles load gracefully when file is missing', async () => {
    const missingMachine = new LockoutStateMachine({
      lockoutPath: join(TEST_DIR, 'nonexistent.json'),
    });
    await missingMachine.load();
    expect(missingMachine.getCheckResult().state).toBe('ok');
  });

  it('handles load gracefully when file is corrupt', async () => {
    await writeFile(TEST_LOCKOUT_PATH, 'corrupt json {{{', { mode: 0o600 });
    const corruptMachine = new LockoutStateMachine({ lockoutPath: TEST_LOCKOUT_PATH });
    await corruptMachine.load();
    expect(corruptMachine.getCheckResult().state).toBe('ok');
  });

  it('reset() returns to default state', async () => {
    for (let i = 0; i < THRESHOLD_401_COUNT; i++) {
      await machine.record401('100.64.0.5');
    }
    expect(machine.getCheckResult().locked).toBe(true);

    machine.reset();
    const check = machine.getCheckResult();
    expect(check.state).toBe('ok');
    expect(check.consecutive401s).toBe(0);
    expect(check.locked).toBe(false);
  });
});
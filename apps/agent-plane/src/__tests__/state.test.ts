/**
 * Local state — SQLite WAL persistence.
 */

import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AgentStateStore } from '../state'

describe('AgentStateStore (SQLite WAL)', () => {
  it('persists and reads back state across store instances', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-plane-state-'))
    const dbPath = join(dir, 'agent-state.sqlite')

    const store = new AgentStateStore(dbPath)
    store.setKillSwitchState('STOPPED')
    store.set('custom_key', 'custom_value')
    store.close()

    // Reopen — data must survive (WAL checkpointed on close)
    const reopened = new AgentStateStore(dbPath)
    expect(reopened.getKillSwitchState()).toBe('STOPPED')
    expect(reopened.get('custom_key')).toBe('custom_value')
    reopened.close()

    rmSync(dir, { recursive: true, force: true })
  })

  it('round-trips heartbeat and fingerprint JSON', () => {
    const store = new AgentStateStore(':memory:')
    store.setLastHeartbeat({ acknowledged: true, machineId: 'm1', state: 'OK' })
    expect(store.getLastHeartbeat()).toMatchObject({ acknowledged: true, machineId: 'm1', state: 'OK' })

    store.setFingerprint({
      cpuModel: 'Intel Xeon',
      cpuCores: 8,
      memoryMb: 16384,
      gpus: [],
      diskGb: 512,
      osRelease: 'Arch Linux',
      macs: ['aa:bb:cc:dd:ee:01'],
      collectedAt: '2026-09-09T00:00:00.000Z',
    })
    expect(store.getFingerprint()?.cpuModel).toBe('Intel Xeon')
    expect(store.getFingerprint()?.macs).toEqual(['aa:bb:cc:dd:ee:01'])
    store.close()
  })

  it('returns null for missing keys and corrupt JSON', () => {
    const store = new AgentStateStore(':memory:')
    expect(store.get('nope')).toBeNull()
    expect(store.getLastHeartbeat()).toBeNull()
    store.set('last_heartbeat', '{not json')
    expect(store.getLastHeartbeat()).toBeNull()
    store.close()
  })
})

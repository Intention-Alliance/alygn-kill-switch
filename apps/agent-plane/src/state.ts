/**
 * Local agent state — SQLite (WAL) persistence for the agent plane.
 *
 * Stores the last known kill-switch state, the last heartbeat result,
 * and the last collected fingerprint so the agent survives restarts
 * without re-registering from scratch.
 *
 * WAL mode is enabled for crash safety and concurrent read/write.
 */

import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { HardwareFingerprint } from './integrity'
import type { HeartbeatResponse } from './heartbeat'

export interface AgentStateRow {
  key: string
  value: string
  updatedAt: string
}

export class AgentStateStore {
  private readonly db: Database

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true })
    }
    this.db = new Database(dbPath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `)
  }

  get(key: string): string | null {
    const row = this.db
      .query<{ value: string }, string>('SELECT value FROM agent_state WHERE key = ?')
      .get(key)
    return row?.value ?? null
  }

  set(key: string, value: string): void {
    this.db
      .query(
        `INSERT INTO agent_state (key, value, updatedAt)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
      )
      .run(key, value, new Date().toISOString())
  }

  getKillSwitchState(): string | null {
    return this.get('kill_switch_state')
  }

  setKillSwitchState(state: string): void {
    this.set('kill_switch_state', state)
  }

  getLastHeartbeat(): HeartbeatResponse | null {
    const raw = this.get('last_heartbeat')
    if (!raw) return null
    try {
      return JSON.parse(raw) as HeartbeatResponse
    } catch {
      return null
    }
  }

  setLastHeartbeat(response: HeartbeatResponse): void {
    this.set('last_heartbeat', JSON.stringify(response))
  }

  getFingerprint(): HardwareFingerprint | null {
    const raw = this.get('fingerprint')
    if (!raw) return null
    try {
      return JSON.parse(raw) as HardwareFingerprint
    } catch {
      return null
    }
  }

  setFingerprint(fingerprint: HardwareFingerprint): void {
    this.set('fingerprint', JSON.stringify(fingerprint))
  }

  close(): void {
    this.db.close()
  }
}

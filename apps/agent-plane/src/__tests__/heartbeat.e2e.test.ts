/**
 * Heartbeat — live e2e against the real mother machine.
 *
 * Verified live on andlersrv: POST /v1/discovery/heartbeat →
 * {"acknowledged":true,"signature":{...},"state":"OK"}.
 *
 * Skipped when the mother is unreachable or no API key is configured
 * (ALYGN_AGENT_API_KEY env, or KILL_SWITCH_API_KEY in the repo .env).
 */

import { describe, expect, it } from 'bun:test'
import { readFileSync, existsSync } from 'node:fs'
import { HeartbeatClient } from '../heartbeat'

function loadApiKey(): string | null {
  if (process.env.ALYGN_AGENT_API_KEY) return process.env.ALYGN_AGENT_API_KEY
  const envPath = new URL('../../../../.env', import.meta.url).pathname
  if (existsSync(envPath)) {
    const match = readFileSync(envPath, 'utf8').match(/^KILL_SWITCH_API_KEY=(.+)$/m)
    if (match) return match[1]!.trim()
  }
  return null
}

const MOTHER_URL = process.env.ALYGN_MOTHER_URL ?? 'http://localhost:3000'
const API_KEY = loadApiKey()

describe('HeartbeatClient e2e (real mother)', () => {
  const machineId = `ws-a-e2e-${Date.now()}`

  it('POST /v1/discovery/heartbeat is acknowledged with state OK', async () => {
    if (!API_KEY) {
      console.warn('SKIP: no ALYGN_AGENT_API_KEY / KILL_SWITCH_API_KEY configured')
      return
    }
    const client = new HeartbeatClient({
      motherUrl: MOTHER_URL,
      apiKey: API_KEY,
      machineId,
      hostname: 'andlersrv',
    })
    const response = await client.send({ cpuModel: 'e2e-probe' })
    expect(response.acknowledged).toBe(true)
    expect(response.machineId).toBe(machineId)
    expect(response.state).toBe('OK')
    expect(response.signature?.algorithm).toBe('sha256')
    expect(response.signature?.hash).toMatch(/^[0-9a-f]{64}$/)
  }, 15_000)
})

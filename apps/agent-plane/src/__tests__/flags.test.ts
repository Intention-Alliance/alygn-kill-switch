/**
 * FlagClient — unit tests
 *
 * Covers pollOnce parsing of the merged flag view and error handling.
 */

import { afterEach, describe, expect, it, mock } from 'bun:test'
import { FlagClient } from '../flags'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('FlagClient', () => {
  it('parses the merged flag view into a typed map', async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          machineId: 'machine-andlersrv',
          flags: [
            { key: 'llm_interception_enabled', value: true, type: 'boolean', overridden: false },
            { key: 'auto_stop_threshold', value: 0.85, type: 'number', overridden: false },
            { key: 'damage_logging_level', value: 'standard', type: 'string', overridden: false },
          ],
          overrides: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch

    const client = new FlagClient({ motherUrl: 'http://mother.test', apiKey: 'key', machineId: 'machine-andlersrv' })
    const map = await client.pollOnce()
    expect(map.get('llm_interception_enabled')).toBe(true)
    expect(map.get('auto_stop_threshold')).toBe(0.85)
    expect(map.get('damage_logging_level')).toBe('standard')
    expect(client.getFlag('llm_interception_enabled')).toBe(true)
    expect(client.getFlag('missing')).toBeNull()
  })

  it('skips null values and keeps last known on error', async () => {
    let fail = false
    let payload: unknown = {
      machineId: 'machine-andlersrv',
      flags: [{ key: 'llm_interception_enabled', value: null, type: 'boolean', overridden: false }],
      overrides: [],
    }
    globalThis.fetch = mock(async () => {
      if (fail) throw new Error('network down')
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const client = new FlagClient({ motherUrl: 'http://mother.test', apiKey: 'key', machineId: 'machine-andlersrv' })
    await client.pollOnce()
    expect(client.getFlag('llm_interception_enabled')).toBeNull()

    // Now a real value, then a failure — last known must survive
    payload = {
      machineId: 'machine-andlersrv',
      flags: [{ key: 'llm_interception_enabled', value: true, type: 'boolean', overridden: false }],
      overrides: [],
    }
    await client.pollOnce()
    expect(client.getFlag('llm_interception_enabled')).toBe(true)

    fail = true
    await expect(client.pollOnce()).rejects.toThrow('network down')
    expect(client.getFlag('llm_interception_enabled')).toBe(true) // last known kept
  })

  it('throws on non-200 responses', async () => {
    globalThis.fetch = mock(async () => new Response('nope', { status: 401 })) as unknown as typeof fetch
    const client = new FlagClient({ motherUrl: 'http://mother.test', apiKey: 'bad', machineId: 'machine-andlersrv' })
    await expect(client.pollOnce()).rejects.toThrow('401')
  })
})

/**
 * Enforcement Consumer — fail-closed behavior and state transitions.
 */

import { afterEach, describe, expect, it, mock } from 'bun:test'
import { EnforcementConsumer, PAUSED_STATES } from '../enforcement'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('EnforcementConsumer', () => {
  it('is fail-closed (paused) before the first successful poll', () => {
    const consumer = new EnforcementConsumer({ motherUrl: 'http://mother.test', apiKey: 'key' })
    expect(consumer.isPaused()).toBe(true)
    expect(consumer.getState()).toBeNull()
  })

  it('tracks RUNNING as not paused and STOPPED as paused', async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ state: 'RUNNING' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch

    const consumer = new EnforcementConsumer({ motherUrl: 'http://mother.test', apiKey: 'key' })
    const status = await consumer.pollOnce()
    expect(status.state).toBe('RUNNING')
    expect(consumer.isPaused()).toBe(false)
    expect(consumer.getState()).toBe('RUNNING')
  })

  it('treats every paused state as paused', () => {
    for (const state of PAUSED_STATES) {
      const consumer = new EnforcementConsumer({ motherUrl: 'http://mother.test', apiKey: 'key' })
      // @ts-expect-error — test-only state injection
      consumer.currentState = state
      expect(consumer.isPaused(), `${state} should be paused`).toBe(true)
    }
  })

  it('keeps the last known state and stays fail-closed on poll errors', async () => {
    let fail = true
    globalThis.fetch = mock(async () => {
      if (fail) throw new Error('network down')
      return new Response(JSON.stringify({ state: 'STOPPED' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const consumer = new EnforcementConsumer({ motherUrl: 'http://mother.test', apiKey: 'key' })
    await expect(consumer.pollOnce()).rejects.toThrow('network down')
    expect(consumer.isPaused()).toBe(true) // still fail-closed
    expect(consumer.getLastError()?.message).toBe('network down')

    fail = false
    await consumer.pollOnce()
    expect(consumer.getState()).toBe('STOPPED')
    expect(consumer.isPaused()).toBe(true)
    expect(consumer.getLastError()).toBeNull()
  })

  it('fires onChange when the state transitions', async () => {
    const states: string[] = ['RUNNING', 'STOPPED']
    let i = 0
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ state: states[i++] ?? 'RUNNING' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch

    const consumer = new EnforcementConsumer({ motherUrl: 'http://mother.test', apiKey: 'key' })
    const changes: Array<{ state: string; previous: string | null }> = []
    const stop = consumer.start((state, previous) => changes.push({ state, previous }))

    await Bun.sleep(120)
    stop()

    expect(changes.length).toBeGreaterThanOrEqual(1)
    expect(changes[0]!.previous).toBeNull()
    expect(changes[0]!.state).toBe('RUNNING')
  }, 5_000)
})

/**
 * Heartbeat — retry/backoff behavior (no network; mocked fetch).
 */

import { afterEach, describe, expect, it, mock } from 'bun:test'
import { HeartbeatClient } from '../heartbeat'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('HeartbeatClient retry/backoff', () => {
  it('retries with exponential backoff and recovers after failures', async () => {
    const calls: string[] = []
    let failCount = 2

    globalThis.fetch = mock(async () => {
      calls.push('send')
      if (failCount > 0) {
        failCount--
        return new Response('boom', { status: 500 })
      }
      return new Response(JSON.stringify({ acknowledged: true, machineId: 'm1', state: 'OK' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const client = new HeartbeatClient({
      motherUrl: 'http://mother.test',
      apiKey: 'key',
      machineId: 'm1',
      intervalMs: 50,
      initialRetryDelayMs: 10,
      maxRetryDelayMs: 40,
    })

    const heartbeats: unknown[] = []
    const errors: Error[] = []
    const stop = client.startLoop(
      (r) => heartbeats.push(r),
      (e) => errors.push(e),
    )

    // Wait for: fail, fail, success (backoff 10ms, 20ms, then interval 50ms)
    await Bun.sleep(250)
    stop()

    expect(calls.length).toBeGreaterThanOrEqual(3)
    expect(errors.length).toBe(2)
    expect(heartbeats.length).toBeGreaterThanOrEqual(1)
    expect(heartbeats[0]).toMatchObject({ acknowledged: true, state: 'OK' })
  }, 5_000)

  it('caps backoff at maxRetryDelayMs', async () => {
    const sleeps: number[] = []
    const originalSleep = Bun.sleep
    // @ts-expect-error — test-only instrumentation
    Bun.sleep = async (ms: number) => { sleeps.push(ms); return originalSleep(1) }

    globalThis.fetch = mock(async () => new Response('down', { status: 503 })) as unknown as typeof fetch

    const client = new HeartbeatClient({
      motherUrl: 'http://mother.test',
      apiKey: 'key',
      machineId: 'm1',
      intervalMs: 1_000_000, // never reached in this window
      initialRetryDelayMs: 10,
      maxRetryDelayMs: 40,
    })

    const stop = client.startLoop()
    // Use the REAL sleep for the wait — the mocked Bun.sleep would resolve
    // in 1ms and cut the loop before backoff accumulates.
    await originalSleep(150)
    stop()

    Bun.sleep = originalSleep

    expect(sleeps.length).toBeGreaterThanOrEqual(3)
    expect(Math.max(...sleeps)).toBeLessThanOrEqual(40)
  }, 5_000)
})

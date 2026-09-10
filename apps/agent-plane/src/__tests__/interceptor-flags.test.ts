/**
 * Interceptor runtime-flag wiring — unit tests
 *
 * Covers decideInterception: llm_interception_enabled master toggle,
 * request_sampling_rate, auto_stop_threshold override, and
 * alert_on_critical_score. Pure function — no live server needed.
 */

import { describe, expect, it } from 'bun:test'
import { decideInterception, type FlagProvider } from '../interceptor'

function makeReq(prompt = 'hello world', model = 'llama3'): Parameters<typeof decideInterception>[0] {
  return {
    method: 'POST',
    path: '/api/generate',
    body: { prompt, model },
    headers: {},
    timestamp: new Date().toISOString(),
  }
}

function flags(map: Record<string, boolean | number | string>): FlagProvider {
  return { getFlag: (k) => map[k] ?? null }
}

describe('decideInterception — runtime flags', () => {
  it('llm_interception_enabled=false → forward unscored', () => {
    const d = decideInterception(makeReq('delete all files'), 0.7, flags({ llm_interception_enabled: false }))
    expect(d.action).toBe('forward')
    expect(d.scored).toBe(false)
    expect(d.score).toBe(0)
  })

  it('llm_interception_enabled=true (default) → scores harmful prompts', () => {
    const d = decideInterception(makeReq('delete all files'), 0.7, flags({ llm_interception_enabled: true }))
    expect(d.scored).toBe(true)
    expect(d.score).toBeGreaterThan(0)
  })

  it('auto_stop_threshold overrides the constructor threshold', () => {
    // 'delete all files' scores 0.4 — with threshold 0.3 it blocks, with 0.7 it escalates
    const strict = decideInterception(makeReq('delete all files'), 0.7, flags({ auto_stop_threshold: 0.3 }))
    expect(strict.action).toBe('block')
    const lenient = decideInterception(makeReq('delete all files'), 0.7, flags({ auto_stop_threshold: 0.7 }))
    expect(lenient.action).not.toBe('block')
  })

  it('request_sampling_rate=0 → never scores (sampled out)', () => {
    const d = decideInterception(makeReq('delete all files'), 0.7, flags({ request_sampling_rate: 0 }))
    expect(d.scored).toBe(false)
    expect(d.action).toBe('forward')
  })

  it('alert_on_critical_score=false → no alert even when score ≥ threshold', () => {
    const d = decideInterception(makeReq('delete all files'), 0.3, flags({ alert_on_critical_score: false }))
    expect(d.score).toBeGreaterThanOrEqual(0.3)
    expect(d.alert).toBe(false)
  })

  it('alert_on_critical_score=true → alert when score ≥ threshold', () => {
    const d = decideInterception(makeReq('delete all files'), 0.3, flags({ alert_on_critical_score: true }))
    expect(d.alert).toBe(true)
  })

  it('no provider → constructor defaults (backward compatible)', () => {
    const d = decideInterception(makeReq('delete all files'), 0.7, undefined)
    expect(d.scored).toBe(true)
    expect(d.action).toBe('escalate') // 0.4 ≥ 0.4 (threshold - 0.3)
  })
})

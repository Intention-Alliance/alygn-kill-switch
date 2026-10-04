/**
 * Registry — presence-based provider registration.
 */

import { describe, it, expect } from 'bun:test';
import { buildRegistry } from '../registry';
import type { VerifierLike } from '../providers/ollama';

const verifier: VerifierLike = {
  verify: async () => ({ verdict: 'SAFE', confidence: 0.9, reason: '', latencyMs: 1, model: 'x', degraded: false }),
};

describe('buildRegistry', () => {
  it('registers only keyword by default', () => {
    const r = buildRegistry({ threshold: 0.85 });
    expect(r.names()).toEqual(['keyword']);
  });

  it('adds ollama when a verifier is provided', () => {
    const r = buildRegistry({ threshold: 0.85, verifier });
    expect(r.names().sort()).toEqual(['keyword', 'ollama']);
  });

  it('adds jev only when an api key is present', () => {
    const without = buildRegistry({ threshold: 0.85, jev: { apiKey: '' } });
    expect(without.has('jev')).toBe(false);

    const withKey = buildRegistry({ threshold: 0.85, jev: { apiKey: 'k' } });
    expect(withKey.has('jev')).toBe(true);
  });

  it('adds remote only when a mother url is present', () => {
    const r = buildRegistry({
      threshold: 0.85,
      remote: { motherUrl: 'http://localhost:3000', apiKey: 'k', machineId: 'm1' },
    });
    expect(r.has('remote')).toBe(true);
  });

  it('returns undefined for an unknown provider', () => {
    const r = buildRegistry({ threshold: 0.85 });
    expect(r.get('nope')).toBeUndefined();
  });
});

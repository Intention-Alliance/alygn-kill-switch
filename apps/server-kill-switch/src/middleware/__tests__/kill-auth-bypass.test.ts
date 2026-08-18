/**
 * Kill Authorization auth-bypass decision tests (ADR-136)
 *
 * Verifies that the assertion-token auth bypass is restricted to POST
 * write paths. GET read endpoints (which return request metadata —
 * signatures with userId, credentialId, IPs, reasons, targets) must NOT
 * bypass auth, so unauthenticated callers cannot enumerate them.
 */

import { describe, expect, it } from 'bun:test';
import { isKillAuthBypassPath } from '../kill-auth-bypass';

describe('isKillAuthBypassPath', () => {
  it('POST to /v1/kill-authorization/requests/:id/approve bypasses auth', () => {
    expect(isKillAuthBypassPath('POST', '/v1/kill-authorization/requests/req-1/approve')).toBe(true);
  });

  it('POST to /v1/kill-authorization/requests (initiate) bypasses auth', () => {
    expect(isKillAuthBypassPath('POST', '/v1/kill-authorization/requests')).toBe(true);
  });

  it('POST to /v1/kill-switch/chaos bypasses auth', () => {
    expect(isKillAuthBypassPath('POST', '/v1/kill-switch/chaos')).toBe(true);
  });

  it('POST to /v1/audit/verify bypasses auth (carries its own assertion token)', () => {
    expect(isKillAuthBypassPath('POST', '/v1/audit/verify')).toBe(true);
  });

  it('POST to /v1/audit/anchor bypasses auth (carries its own assertion token)', () => {
    expect(isKillAuthBypassPath('POST', '/v1/audit/anchor')).toBe(true);
  });

  it('GET to /v1/audit/* does NOT bypass auth (read endpoints)', () => {
    expect(isKillAuthBypassPath('GET', '/v1/audit/verify')).toBe(false);
  });

  it('GET to /v1/kill-authorization/requests does NOT bypass auth (read endpoint)', () => {
    expect(isKillAuthBypassPath('GET', '/v1/kill-authorization/requests')).toBe(false);
  });

  it('GET to /v1/kill-authorization/requests/:id does NOT bypass auth (read endpoint)', () => {
    expect(isKillAuthBypassPath('GET', '/v1/kill-authorization/requests/req-1')).toBe(false);
  });

  it('GET to /v1/kill-authorization/requests/:id/signatures does NOT bypass auth', () => {
    expect(isKillAuthBypassPath('GET', '/v1/kill-authorization/requests/req-1/signatures')).toBe(false);
  });

  it('non-kill-authorization paths do not bypass auth', () => {
    expect(isKillAuthBypassPath('POST', '/v1/flags')).toBe(false);
    expect(isKillAuthBypassPath('GET', '/v1/kill-switch/state')).toBe(false);
    expect(isKillAuthBypassPath('GET', '/v1/kill-switch/chaos')).toBe(false);
  });
});

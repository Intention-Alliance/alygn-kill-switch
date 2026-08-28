/**
 * Fail-start guard tests — P1-2 (Stage 2 fix).
 *
 * Verifies the invariant enforced by assertProxyAndVerificationInvariant:
 *   killSwitchVerificationEnabled=true REQUIRES verifyEnabled=true.
 *
 * A misconfigured env (proxy on, verify off) must throw at startup so the
 * container exits non-zero and the orchestrator restarts visibly. The guard
 * must NEVER pass silently — the spec calls this out as a P1 safety issue
 * because verification-off + proxy-on = unverified content reaches clients
 * with no kill-switch doctrine.
 */

import { describe, expect, it } from 'bun:test'
import { assertProxyAndVerificationInvariant } from '../proxy-invariants'

describe('assertProxyAndVerificationInvariant (P1-2 fail-start guard)', () => {
	it('throws when killSwitchVerificationEnabled=true AND verifyEnabled=false', () => {
		expect(() => assertProxyAndVerificationInvariant(true, false)).toThrow(
			/FAIL-START/,
		)
	})

	it('throws with an actionable message naming the missing env var', () => {
		expect(() => assertProxyAndVerificationInvariant(true, false)).toThrow(
			/KILL_SWITCH_VERIFY_ENABLED/,
		)
	})

	it('passes when killSwitchVerificationEnabled=true AND verifyEnabled=true', () => {
		expect(() => assertProxyAndVerificationInvariant(true, true)).not.toThrow()
	})

	it('passes when killSwitchVerificationEnabled=false AND verifyEnabled=false (no proxy, no verify)', () => {
		expect(() =>
			assertProxyAndVerificationInvariant(false, false),
		).not.toThrow()
	})

	it('passes when killSwitchVerificationEnabled=false AND verifyEnabled=true (defensive)', () => {
		// Edge case: verify enabled without the proxy flag. The verifier runs
		// pre-screen-only (no relay), which is fine — the guard does not block
		// this configuration because the dangerous case is the inverse.
		expect(() => assertProxyAndVerificationInvariant(false, true)).not.toThrow()
	})

	it('produces a stable error prefix so operators can grep logs', () => {
		try {
			assertProxyAndVerificationInvariant(true, false)
			expect.unreachable('should have thrown')
		} catch (err) {
			expect(err).toBeInstanceOf(Error)
			expect((err as Error).message.startsWith('FAIL-START:')).toBe(true)
		}
	})
})

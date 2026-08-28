/**
 * Verification Event — outputTruncated annotation (P1-3, Stage 2 fix).
 *
 * The truncation marker tells the dashboard that the verifier only saw a
 * partial slice of a streamed response. The annotation must:
 *   - Append `output-truncated:streamed-above-256KB-cap` to the reason field
 *   - Preserve the original reason text as a suffix (so operators can still
 *     see why the verifier classified the partial slice)
 *   - Apply the marker only when outputTruncated=true; otherwise the
 *     original reason flows through unchanged.
 *
 * Tests the pure `composeEventReason` helper directly (avoids dragging in
 * the DB layer, which has its own coverage in verification-service.test.ts).
 */

import { describe, expect, it } from 'bun:test'
import { composeEventReason } from '../verification-event'

describe('composeEventReason (P1-3 truncation marker)', () => {
	it('appends the truncation marker when outputTruncated=true', () => {
		expect(composeEventReason('looks fine', true)).toBe(
			'looks fine | output-truncated:streamed-above-256KB-cap',
		)
	})

	it('preserves the original reason when outputTruncated=false', () => {
		expect(composeEventReason('looks fine', false)).toBe('looks fine')
	})

	it('returns the marker alone when the verifier returned no reason', () => {
		expect(composeEventReason('', true)).toBe(
			'output-truncated:streamed-above-256KB-cap',
		)
	})

	it('returns the marker alone when the verifier returned undefined reason', () => {
		expect(composeEventReason(undefined, true)).toBe(
			'output-truncated:streamed-above-256KB-cap',
		)
	})

	it('returns null when both reason and truncation are absent', () => {
		expect(composeEventReason('', false)).toBe(null)
		expect(composeEventReason(undefined, false)).toBe(null)
	})

	it('defaults to no-truncation when the flag is undefined', () => {
		expect(composeEventReason('looks fine', undefined)).toBe('looks fine')
	})

	it('produces a stable marker string operators can grep', () => {
		const marker = 'output-truncated:streamed-above-256KB-cap'
		expect(composeEventReason('any reason', true)).toContain(marker)
	})
})

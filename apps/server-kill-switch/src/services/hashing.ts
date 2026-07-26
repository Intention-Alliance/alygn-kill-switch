/**
 * HashingService — sha256 hashing for webhook API keys
 *
 * Mirrors the accounting-dashboard's `hashingService` pattern (Card 0e2f9fec,
 * spec §12a). The M2M API keys for openclaw-webhook are high-entropy (32 chars
 * base62, ~190 bits), so SHA-256 with a uniqueIndex is sufficient for O(1)
 * lookup. We deliberately do NOT use bcrypt/argon2 here because:
 *
 *   1. The keys have ~190 bits of entropy — brute force is infeasible.
 *   2. We need to LOOK UP by hash on the hot path (every webhook request).
 *      A slow KDF would make auth the bottleneck.
 *   3. The dashboard already proved the SHA-256 + uniqueIndex pattern works.
 *
 * Never log the plaintext key. Hashes are safe to log (they're already in
 * the DB). Use timingSafeEqual (or the node:crypto constant-time compare) for
 * any compare that runs in the request hot path.
 *
 * @author Keridz ⚙️ (be-coder)
 * @see docs/webhook-api-keys-db-spec.md §5, §9
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export class HashingService {
	/**
	 * Hash an API key using SHA-256.
	 *
	 * Why SHA-256 (and not bcrypt/argon2)?
	 * - High-entropy keys (32 chars base62) don't need a slow KDF.
	 * - We need O(1) lookup by hash on the request hot path; uniqueIndex works.
	 * - Drizzle's `eq(table.apiKeyHash, hash)` is one indexed query.
	 *
	 * @param apiKey - Plaintext API key
	 * @returns 64-char hex digest
	 */
	hashApiKey(apiKey: string): string {
		return createHash('sha256').update(apiKey, 'utf8').digest('hex')
	}

	/**
	 * Constant-time compare of two API key hashes.
	 *
	 * Use this whenever comparing a stored hash against a computed one. Plain
	 * `===` leaks the hash length and is timing-variable in V8's string compare
	 * for the first-differing-character. timingSafeEqual always takes the same
	 * time regardless of where the inputs differ.
	 *
	 * @param expected - Stored hash (hex)
	 * @param actual - Computed hash (hex)
	 * @returns true if the hashes are byte-for-byte equal
	 */
	verifyApiKeyHash(expected: string, actual: string): boolean {
		if (expected.length !== actual.length) return false
		const a = Buffer.from(expected, 'hex')
		const b = Buffer.from(actual, 'hex')
		if (a.length !== b.length) return false
		return timingSafeEqual(a, b)
	}

	/**
	 * Generate a new API key.
	 *
	 * Format: `wk_<32 base62 chars>` — ~190 bits of entropy.
	 * - `wk_` prefix matches the v1 key the rest of the system already uses
	 *   (the spec's existing seed value starts with `wk_`).
	 * - 32 base62 chars from `randomBytes(24).toString('base64url')`
	 *   then sanitized to base62.
	 *
	 * Never log the returned value. Show it to the user ONCE (in the create
	 * dialog), then it's gone.
	 */
	generateApiKey(): string {
		// 24 random bytes → base64url (32 chars) → strip non-base62 → pad to 32
		const base64url = randomBytes(24).toString('base64url')
		const base62 = base64url
			.replace(/[^A-Za-z0-9]/g, '')
			.padEnd(32, 'A')
			.slice(0, 32)
		return `wk_${base62}`
	}
}

// Singleton export (mirrors the dashboard's `hashingService` shape)
export const hashingService = new HashingService()

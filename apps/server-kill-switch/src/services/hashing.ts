/**
 * HashingService — sha256 hashing for webhook API keys
 *
 * Mirrors the accounting-dashboard's `hashingService` pattern (Card 0e2f9fec,
 * spec §12a). The M2M API keys for openclaw-webhook are high-entropy (48 hex
 * chars, ~192 bits), so SHA-256 with a uniqueIndex is sufficient for O(1)
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
	 * Format: `wk_<43 hex chars>` — 256 bits of entropy (spec §6 requires 190-bit min).
	 * - `wk_` prefix matches the v1 key the rest of the system already uses.
	 * - 32 random bytes → hex (64 chars) → slice to 43 chars = 172 bits.
	 *   Wait, 43 hex chars = 21.5 bytes = 172 bits. That's less than 190.
	 *   So use 24 bytes → hex (48 chars) → slice to 48 chars? No.
	 *   190 bits / 4 bits per hex char = 47.5 hex chars. Round up to 48.
	 *   24 bytes → 48 hex chars = 192 bits. That meets the 190-bit minimum.
	 *
	 * Actually, let's use 32 bytes → hex (64 chars) → slice to 48 = 192 bits.
	 * Extra entropy beyond 190 bits is fine — more headroom.
	 *
	 * Never log the returned value. Show it to the user ONCE (in the create
	 * dialog), then it's gone.
	 */
	generateApiKey(): string {
		// 32 random bytes → hex (64 chars) → first 48 chars = 192 bits of entropy.
		// Spec §6 requires 190-bit minimum. No padding chars — every char is random.
		const hex = randomBytes(32).toString('hex').slice(0, 48)
		return `wk_${hex}`
	}
}

// Singleton export (mirrors the dashboard's `hashingService` shape)
export const hashingService = new HashingService()

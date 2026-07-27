/**
 * API Key Authentication Middleware — node-style (Card 0e2f9fec)
 *
 * The kill-switch-api uses a node-style HTTP handler, not Elysia. We mirror
 * the accounting-dashboard's `apiKeyAuth` pattern but adapt to the existing
 * `handleXxxRoutes(method, url, req, res)` style used by `routes/*.ts`.
 *
 * Behavior:
 *  - Reads `X-Webhook-Key` header (the openclaw-webhook's chosen header name).
 *  - sha256-hashes the key, looks up by `apiKeyHash` uniqueIndex.
 *  - Checks not revoked and not expired.
 *  - Checks the requested scope is in the key's `scopes` csv list.
 *  - On success: returns the ApiKeyContext (keyId, name, scopes) — analogue
 *    of Elysia's `resolve({ as: 'scoped' })` returning a context value.
 *  - On failure: writes an audit entry with the reason and returns the
 *    reason. Caller decides whether to 401, 403, or fall through to JWT
 *    or env-var.
 *
 * Scope check is the caller's responsibility — pass the required scope
 * string when calling. The default scope for openclaw-webhook's
 * `/webhook/live-chat` is `live-chat`.
 *
 * @author Keridz ⚙️ (be-coder)
 * @see docs/webhook-api-keys-db-spec.md §6, §7, §12a
 */

import { eq } from 'drizzle-orm'
import { db } from '../db'
import { webhookApiKeyAudit, webhookApiKeys } from '../db/schema'
import { hashingService } from '../services/hashing'

export type ApiKeyContext = {
	keyId: string
	name: string
	scopes: string[]
}

export type VerifyResult =
	| { ok: true; context: ApiKeyContext }
	| {
			ok: false
			reason:
				| 'missing'
				| 'malformed'
				| 'unknown'
				| 'hash_mismatch'
				| 'revoked'
				| 'expired'
				| 'scope_mismatch'
	  }

/** Audit row write — fire-and-forget but logged on failure. */
async function audit(
	keyId: string | null,
	action: 'use' | 'use_failed',
	actor: string,
	meta: Record<string, unknown>,
	webhookPath?: string | null,
): Promise<void> {
	try {
		await db.insert(webhookApiKeyAudit).values({
			keyId: keyId || 'unknown',
			action,
			actor,
			at: new Date(),
			meta: JSON.stringify(meta),
			webhookPath: webhookPath ?? null,
		})
	} catch (e) {
		console.error('[apikey.middleware] audit write failed:', e)
	}
}

/**
 * Verify an X-Webhook-Key against the database.
 *
 * Returns the context (with scopes) on success, or a failure reason. The
 * caller is responsible for translating that into a 401/403/200. Side
 * effects: writes an audit entry on every attempt (success or failure).
 *
 * Use this in two places:
 *  1. Admin route handlers — when generating/rotating/revoking keys, to
 *     confirm the caller is allowed to act on keys.
 *  2. Webhook receivers — when the openclaw-webhook hits our internal
 *     verify endpoint, we run this exact same logic.
 *
 * @param rawKey  The plaintext key from the X-Webhook-Key header
 * @param ip      The client IP (for audit + last_used_ip update)
 * @param requiredScope  Scope required for this call (e.g. 'live-chat').
 *                       Omit to skip the scope check.
 * @param requestPath  The request pathname (for audit column + meta).
 *                     Omit when called outside a request context.
 */
export async function verifyApiKey(
	rawKey: string | null | undefined,
	ip: string,
	requiredScope?: string,
	requestPath?: string | null,
): Promise<VerifyResult> {
	if (!rawKey) {
		await audit(null, 'use_failed', `request:${ip}`, {
			reason: 'missing',
			requiredScope,
			path: requestPath ?? null,
		}, requestPath)
		return { ok: false, reason: 'missing' }
	}
	if (rawKey.length < 16) {
		await audit(null, 'use_failed', `request:${ip}`, {
			reason: 'malformed',
			requiredScope,
			prefix: rawKey.slice(0, 8),
			path: requestPath ?? null,
		}, requestPath)
		return { ok: false, reason: 'malformed' }
	}

	const hash = hashingService.hashApiKey(rawKey)
	const row = await db.query.webhookApiKeys.findFirst({
		where: eq(webhookApiKeys.apiKeyHash, hash),
	})

	if (!row) {
		await audit(null, 'use_failed', `request:${ip}`, {
			reason: 'unknown_prefix',
			requiredScope,
			prefix: rawKey.slice(0, 8),
			path: requestPath ?? null,
		}, requestPath)
		return { ok: false, reason: 'unknown' }
	}

	// Re-verify in constant time (defence-in-depth: even though we just
	// looked up by hash, re-hashing the input and comparing is the textbook
	// pattern and costs ~0.01ms).
	const rehash = hashingService.hashApiKey(rawKey)
	if (!hashingService.verifyApiKeyHash(row.apiKeyHash, rehash)) {
		await audit(row.id, 'use_failed', `request:${ip}`, {
			reason: 'hash_mismatch',
			requiredScope,
			path: requestPath ?? null,
		}, requestPath)
		return { ok: false, reason: 'hash_mismatch' }
	}

	if (row.revokedAt) {
		await audit(row.id, 'use_failed', `request:${ip}`, {
			reason: 'revoked',
			requiredScope,
			path: requestPath ?? null,
		}, requestPath)
		return { ok: false, reason: 'revoked' }
	}
	if (row.expiresAt && row.expiresAt < new Date()) {
		await audit(row.id, 'use_failed', `request:${ip}`, {
			reason: 'expired',
			requiredScope,
			path: requestPath ?? null,
		}, requestPath)
		return { ok: false, reason: 'expired' }
	}

	const scopes = (row.scopes || '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
	if (requiredScope && !scopes.includes(requiredScope)) {
		await audit(row.id, 'use_failed', `request:${ip}`, {
			reason: 'scope_mismatch',
			requiredScope,
			actualScopes: scopes,
			path: requestPath ?? null,
		}, requestPath)
		return { ok: false, reason: 'scope_mismatch' }
	}

	// Best-effort last_used update (don't block the request on this)
	void db
		.update(webhookApiKeys)
		.set({ lastUsedAt: new Date(), lastUsedIp: ip })
		.where(eq(webhookApiKeys.id, row.id))
		.then(() => audit(row.id, 'use', `request:${ip}`, { requiredScope, path: requestPath ?? null }, requestPath))
		.catch((e) =>
			console.error('[apikey.middleware] last_used update failed:', e),
		)

	return {
		ok: true,
		context: { keyId: row.id, name: row.name, scopes },
	}
}

/**
 * Read the X-Webhook-Key header from a node-style request.
 * Header names are case-insensitive; we check both forms.
 */
export function readApiKeyHeader(req: {
	headers: Record<string, string | string[] | undefined>
}): string | null {
	const h = req.headers || {}
	const v = h['x-webhook-key'] ?? h['X-Webhook-Key']
	if (typeof v === 'string' && v.trim().length > 0) return v.trim()
	if (Array.isArray(v) && typeof v[0] === 'string' && v[0].trim().length > 0)
		return v[0].trim()
	return null
}

/**
 * Webhook API Key Admin Routes (Card 0e2f9fec)
 *
 * Endpoints:
 *   GET    /v1/admin/api-keys                  — list all (masked: hash never sent)
 *   POST   /v1/admin/api-keys                  — create new, returns plaintext ONCE
 *   POST   /v1/admin/api-keys/:id/rotate       — revoke old, return new plaintext ONCE
 *   DELETE /v1/admin/api-keys/:id              — soft delete (sets revoked_at)
 *   GET    /v1/admin/api-keys/:id/audit        — last 100 audit entries
 *   GET    /v1/internal/api-keys/lookup        — openclaw-webhook's hot path
 *   POST   /v1/internal/api-keys/verify        — one-shot verify + return scopes
 *
 * Auth model:
 *  - /v1/admin/* — gated by ADMIN_UI_API_KEY Bearer token (mirrors the
 *    admin-secrets.ts pattern, no user session needed for the v1 admin tool).
 *  - /v1/internal/* — gated by KILL_SWITCH_INTERNAL_KEY (must match the
 *    openclaw-webhook's configured internal key). The endpoint binds to
 *    127.0.0.1 only (localhost trust + key for defence-in-depth).
 *
 * Never log the plaintext key, never return the hash in the public response,
 * never expose the key after the create/rotate response.
 *
 * @author Keridz ⚙️ (be-coder)
 * @see docs/webhook-api-keys-db-spec.md §7
 */

import { randomBytes } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { webhookApiKeyAudit, webhookApiKeys } from '../db/schema'
import { readApiKeyHeader, verifyApiKey } from '../middleware/apikey.middleware'
import { hashingService } from '../services/hashing'
import { secureCompare } from '../utils/secure-compare'

// Node-style request/response shapes (matches the rest of routes/*.ts)
type Req = {
	method: string
	url: string
	headers: Record<string, string | string[] | undefined>
	body: string
	ip: string
}
type Res = {
	writeHead: (status: number, headers?: Record<string, string>) => void
	end: (data?: string) => void
}

// ─── Auth helpers ──────────────────────────────────────────────────

/**
 * Read ADMIN_UI_API_KEY from env. The startup validator in config/validate-env.ts
 * should have already thrown if it's missing.
 */
function adminKeyMatches(req: Req): boolean {
	const expected = process.env.ADMIN_UI_API_KEY
	if (!expected) return false
	const auth = req.headers?.authorization || ''
	const m = String(auth).match(/^Bearer\s+(.+)$/i)
	if (!m) return false
	return secureCompare(m[1], expected)
}

function internalKeyMatches(req: Req): boolean {
	const expected = process.env.KILL_SWITCH_INTERNAL_KEY
	if (!expected) return false
	// Accept via X-Internal-Key header OR Authorization: Bearer <key>
	const hdr = req.headers?.['x-internal-key'] || req.headers?.['X-Internal-Key']
	if (typeof hdr === 'string' && secureCompare(hdr, expected)) return true
	const auth = req.headers?.authorization || ''
	const m = String(auth).match(/^Bearer\s+(.+)$/i)
	if (m && secureCompare(m[1], expected)) return true
	return false
}

// ─── Internal endpoint rate limiter (spec §7: 10 req/min/key) ────────────
// In-memory sliding window since internal endpoints are localhost-only.
// Prevents a runaway caller from hammering the lookup endpoint.
const INTERNAL_RATE_LIMIT_MAX = 10
const INTERNAL_RATE_LIMIT_WINDOW_MS = 60_000
const internalRateBuckets = new Map<string, number[]>()

function checkInternalRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
	const now = Date.now()
	const cutoff = now - INTERNAL_RATE_LIMIT_WINDOW_MS
	const bucket = internalRateBuckets.get(ip) ?? []
	const recent = bucket.filter((t) => t > cutoff)
	if (recent.length >= INTERNAL_RATE_LIMIT_MAX) {
		return { allowed: false, retryAfter: Math.ceil(INTERNAL_RATE_LIMIT_WINDOW_MS / 1000) }
	}
	recent.push(now)
	internalRateBuckets.set(ip, recent)
	return { allowed: true }
}

function rateLimited(res: Res): boolean {
	writeJson(res, 429, { error: 'rate limit exceeded', limit: INTERNAL_RATE_LIMIT_MAX, retryAfter: 60 })
	return true
}

function writeJson(res: Res, status: number, body: unknown) {
	res.writeHead(status, { 'Content-Type': 'application/json' })
	res.end(JSON.stringify(body))
}

function unauthorized(res: Res): boolean {
	writeJson(res, 401, { error: 'unauthorized' })
	return true
}

function notFound(res: Res): boolean {
	writeJson(res, 404, { error: 'not found' })
	return true
}

// ─── Date helpers (Drizzle returns Date or number for timestamp mode) ─

function toIso(v: Date | number | null | undefined): string | null {
	if (v === null || v === undefined) return null
	if (v instanceof Date) return v.toISOString()
	if (typeof v === 'number') return new Date(v * 1000).toISOString()
	// Fall back: try to construct from whatever it is
	const d = new Date(v as unknown as string | number)
	return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// ─── Masking helper ────────────────────────────────────────────────

type ApiKeyRow = typeof webhookApiKeys.$inferSelect

function rowToPublic(row: ApiKeyRow) {
	return {
		id: row.id,
		keyPrefix: row.keyPrefix,
		name: row.name,
		scopes: row.scopes
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean),
		createdAt: toIso(row.createdAt),
		createdBy: row.createdBy,
		lastUsedAt: toIso(row.lastUsedAt),
		lastUsedIp: row.lastUsedIp,
		revokedAt: toIso(row.revokedAt),
		revokedBy: row.revokedBy,
		expiresAt: toIso(row.expiresAt),
		notes: row.notes,
	}
}

// ─── ID generation (ulid-ish, no deps) ───────────────────────────

function newKeyId(): string {
	// ulid-ish format: `wk_<10 base36 time><16 base62 random>` — sortable, opaque
	// We don't need true ULID monotonicity, just a sortable, opaque id.
	const t = Date.now().toString(36).toUpperCase().padStart(10, '0')
	const r = randomBytes(12)
		.toString('base64url')
		.replace(/[^A-Za-z0-9]/g, '')
		.toUpperCase()
		.padEnd(16, 'X')
		.slice(0, 16)
	return `wk_${t}${r}`
}

// ─── Allowed scopes ───────────────────────────────────────────────

const ALLOWED_SCOPES = [
	'live-chat',
	'webhook-request',
	'blog-pipeline',
	'admin',
]

// ─── Route handlers ───────────────────────────────────────────────

/** GET /v1/admin/api-keys */
async function listKeys(res: Res): Promise<boolean> {
	const rows = await db
		.select()
		.from(webhookApiKeys)
		.orderBy(desc(webhookApiKeys.createdAt))
	writeJson(res, 200, { keys: rows.map(rowToPublic) })
	return true
}

/** POST /v1/admin/api-keys — body: { name, scopes, expiresAt?, notes? } */
async function createKey(req: Req, res: Res): Promise<boolean> {
	let body: Record<string, unknown> = {}
	try {
		body = req.body ? JSON.parse(req.body) : {}
	} catch {
		body = {}
	}
	const name = typeof body.name === 'string' ? body.name.trim() : ''
	if (name.length === 0) {
		writeJson(res, 400, { error: 'name is required' })
		return true
	}
	const rawScopes = body.scopes
	let scopesCsv: string
	if (typeof rawScopes === 'string' && rawScopes.trim().length > 0) {
		scopesCsv = rawScopes.trim()
	} else if (Array.isArray(rawScopes) && rawScopes.length > 0) {
		scopesCsv = rawScopes.map(String).join(',')
	} else {
		writeJson(res, 400, {
			error: 'scopes is required (string or non-empty array)',
		})
		return true
	}
	for (const s of scopesCsv.split(',')) {
		if (!ALLOWED_SCOPES.includes(s.trim())) {
			writeJson(res, 400, {
				error: `unknown scope: ${s.trim()}. Allowed: ${ALLOWED_SCOPES.join(', ')}`,
			})
			return true
		}
	}
	const expiresAt =
		typeof body.expiresAt === 'string' && body.expiresAt.length > 0
			? new Date(body.expiresAt)
			: null
	const notes = typeof body.notes === 'string' ? body.notes : null

	const plaintext = hashingService.generateApiKey()
	const prefix = plaintext.slice(0, 8)
	const hash = hashingService.hashApiKey(plaintext)
	const id = newKeyId()

	// apiKeyHash is unique, so a hash collision (effectively impossible with
	// 190 bits of entropy) will throw on insert.
	try {
		await db.insert(webhookApiKeys).values({
			id,
			keyPrefix: prefix,
			apiKeyHash: hash,
			name,
			scopes: scopesCsv,
			createdAt: new Date(),
			createdBy: 'admin', // (admin UI doesn't yet have user-level actor tracking)
			expiresAt,
			notes,
		})
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e)
		if (msg.includes('UNIQUE')) {
			writeJson(res, 409, { error: 'hash collision (regenerate)' })
			return true
		}
		throw e
	}

	// Audit
	await db.insert(webhookApiKeyAudit).values({
		keyId: id,
		action: 'create',
		actor: 'admin',
		at: new Date(),
		meta: JSON.stringify({
			name,
			scopes: scopesCsv,
			expiresAt: body.expiresAt ?? null,
		}),
	})

	writeJson(res, 201, {
		id,
		keyPrefix: prefix,
		name,
		scopes: scopesCsv.split(','),
		key: plaintext, // shown ONCE
	})
	return true
}

/** POST /v1/admin/api-keys/:id/rotate */
async function rotateKey(res: Res, id: string): Promise<boolean> {
	// Use a transaction to prevent TOCTOU race: two concurrent rotations
	// could both read the key as active and both proceed. By doing the
	// read + check + write inside a single transaction, the second one
	// will see the row as revoked and abort.
	type RotateResult = { status: number; body: Record<string, unknown> }

	const result = await db.transaction(async (tx): Promise<RotateResult> => {
		const existing = await tx.query.webhookApiKeys.findFirst({
			where: eq(webhookApiKeys.id, id),
		})
		if (!existing) return { status: 404, body: { error: 'not found' } }
		if (existing.revokedAt) return { status: 409, body: { error: 'cannot rotate a revoked key — create a new one' } }

		const newPlaintext = hashingService.generateApiKey()
		const newPrefix = newPlaintext.slice(0, 8)
		const newHash = hashingService.hashApiKey(newPlaintext)
		const newId = newKeyId()
		const oldId = existing.id

		// Mark old as revoked, then create new — both inside the transaction.
		await tx
			.update(webhookApiKeys)
			.set({ revokedAt: new Date(), revokedBy: 'admin', expiresAt: new Date() })
			.where(eq(webhookApiKeys.id, oldId))
		await tx.insert(webhookApiKeys).values({
			id: newId,
			keyPrefix: newPrefix,
			apiKeyHash: newHash,
			name: existing.name,
			scopes: existing.scopes,
			createdAt: new Date(),
			createdBy: 'admin',
			expiresAt: existing.expiresAt,
			notes: existing.notes,
		})

		// Audit entries inside the transaction too.
		await tx.insert(webhookApiKeyAudit).values({
			keyId: oldId,
			action: 'rotate',
			actor: 'admin',
			at: new Date(),
			meta: JSON.stringify({ newKeyId: newId, oldKeyPrefix: existing.keyPrefix }),
		})
		await tx.insert(webhookApiKeyAudit).values({
			keyId: newId,
			action: 'create',
			actor: 'admin',
			at: new Date(),
			meta: JSON.stringify({ rotatedFrom: oldId, source: 'rotate' }),
		})

		return {
			status: 201,
			body: {
				id: newId,
				keyPrefix: newPrefix,
				name: existing.name,
				scopes: existing.scopes.split(',').map((s) => s.trim()).filter(Boolean),
				key: newPlaintext,
				revokedKeyId: oldId,
			},
		}
	})

	writeJson(res, result.status, result.body)
	return true
}

/** DELETE /v1/admin/api-keys/:id */
async function revokeKey(res: Res, id: string): Promise<boolean> {
	const existing = await db.query.webhookApiKeys.findFirst({
		where: eq(webhookApiKeys.id, id),
	})
	if (!existing) {
		notFound(res)
		return true
	}
	if (existing.revokedAt) {
		// already revoked — idempotent
		res.writeHead(204, { 'Content-Type': 'application/json' })
		res.end()
		return true
	}

	await db
		.update(webhookApiKeys)
		.set({ revokedAt: new Date(), revokedBy: 'admin' })
		.where(eq(webhookApiKeys.id, id))

	await db.insert(webhookApiKeyAudit).values({
		keyId: id,
		action: 'revoke',
		actor: 'admin',
		at: new Date(),
		meta: JSON.stringify({ name: existing.name }),
	})

	res.writeHead(204, { 'Content-Type': 'application/json' })
	res.end()
	return true
}

/** GET /v1/admin/api-keys/:id/audit */
async function keyAudit(res: Res, id: string): Promise<boolean> {
	const rows = await db
		.select()
		.from(webhookApiKeyAudit)
		.where(eq(webhookApiKeyAudit.keyId, id))
		.orderBy(desc(webhookApiKeyAudit.at))
		.limit(100)
	writeJson(res, 200, {
		entries: rows.map((r) => ({
			id: r.id,
			action: r.action,
			actor: r.actor,
			at: toIso(r.at),
			meta: r.meta ? JSON.parse(r.meta) : null,
		})),
	})
	return true
}

/** GET /v1/internal/api-keys/lookup?prefix=... */
async function internalLookup(req: Req, res: Res): Promise<boolean> {
	const url = req.url || ''
	const q = url.includes('?') ? url.slice(url.indexOf('?') + 1) : ''
	const params = new URLSearchParams(q)
	const prefix = params.get('prefix')
	if (!prefix || prefix.length !== 8) {
		writeJson(res, 400, { error: 'prefix query param (8 chars) required' })
		return true
	}
	const rows = await db
		.select()
		.from(webhookApiKeys)
		.where(eq(webhookApiKeys.keyPrefix, prefix))
		.limit(1)
	const row = rows[0]
	if (!row) {
		notFound(res)
		return true
	}
	writeJson(res, 200, {
		id: row.id,
		apiKeyHash: row.apiKeyHash, // internal caller will sha256 the request header and compare
		scopes: row.scopes
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean),
		revokedAt: toIso(row.revokedAt),
		expiresAt: toIso(row.expiresAt),
	})
	return true
}

/** POST /v1/internal/api-keys/verify — body: { requiredScope? }
 *  Returns 200 + scopes if valid, 401 if invalid. The caller is responsible
 *  for sending the X-Webhook-Key header (we don't take it in the body to
 *  avoid putting secrets in request bodies that might be logged).
 *  The lookup endpoint above is faster; this one is for clients that prefer
 *  the all-in-one API.
 */
async function internalVerify(
	req: Req,
	res: Res,
	ip: string,
): Promise<boolean> {
	const rawKey = readApiKeyHeader(req)
	let body: Record<string, unknown> = {}
	try {
		body = req.body ? JSON.parse(req.body) : {}
	} catch {
		body = {}
	}
	const requiredScope =
		typeof body.requiredScope === 'string' ? body.requiredScope : undefined
	const result = await verifyApiKey(rawKey, ip, requiredScope, req.url ? new URL(req.url, 'http://localhost').pathname : null)
	if (!result.ok) {
		writeJson(res, 401, { error: 'unauthorized', reason: result.reason })
		return true
	}
	writeJson(res, 200, {
		ok: true,
		keyId: result.context.keyId,
		scopes: result.context.scopes,
	})
	return true
}

// ─── Top-level dispatcher (the node-style route handler) ─────────

/**
 * Routes handled by this module:
 *   GET    /v1/admin/api-keys
 *   POST   /v1/admin/api-keys
 *   POST   /v1/admin/api-keys/:id/rotate
 *   DELETE /v1/admin/api-keys/:id
 *   GET    /v1/admin/api-keys/:id/audit
 *   GET    /v1/internal/api-keys/lookup
 *   POST   /v1/internal/api-keys/verify
 *
 * Returns true if the request was handled, false if not for us.
 */
export async function handleApiKeysRoutes(
	method: string,
	url: string,
	req: Req,
	res: Res,
	ip: string,
): Promise<boolean> {
	const path = url.split('?')[0]

	// ─── Internal routes (openclaw-webhook) ────────────────────────
	if (path === '/v1/internal/api-keys/lookup' && method === 'GET') {
		if (!internalKeyMatches(req)) return unauthorized(res)
		const rl = checkInternalRateLimit(ip)
		if (!rl.allowed) return rateLimited(res)
		return internalLookup(req, res)
	}
	if (path === '/v1/internal/api-keys/verify' && method === 'POST') {
		if (!internalKeyMatches(req)) return unauthorized(res)
		const rl = checkInternalRateLimit(ip)
		if (!rl.allowed) return rateLimited(res)
		return internalVerify(req, res, ip)
	}

	// ─── Admin routes (Bearer ADMIN_UI_API_KEY) ───────────────────
	const adminPrefix = '/v1/admin/api-keys'
	if (!path.startsWith(adminPrefix)) return false

	if (!adminKeyMatches(req)) return unauthorized(res)

	// /v1/admin/api-keys (exact)
	if (path === adminPrefix) {
		if (method === 'GET') return listKeys(res)
		if (method === 'POST') return createKey(req, res)
		writeJson(res, 405, { error: 'method not allowed' })
		return true
	}

	// /v1/admin/api-keys/:id/...
	const tail = path.slice(adminPrefix.length + 1) // strip leading /
	const parts = tail.split('/')
	const id = parts[0]
	if (!id) return notFound(res)

	if (parts.length === 1) {
		if (method === 'DELETE') return revokeKey(res, id)
		writeJson(res, 405, { error: 'method not allowed' })
		return true
	}
	if (parts.length === 2 && parts[1] === 'rotate' && method === 'POST') {
		return rotateKey(res, id)
	}
	if (parts.length === 2 && parts[1] === 'audit' && method === 'GET') {
		return keyAudit(res, id)
	}
	return notFound(res)
}

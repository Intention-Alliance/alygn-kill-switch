/**
 * Webhook Key Lifecycle Routes (ADR-139 §5)
 *
 * Admin endpoints for managing per-org webhook API keys (AI execution
 * calls). Every lifecycle event (create / rotate / revoke / verify) is
 * written to the immutable audit log (ADR-140) with a plain-language
 * explanation.
 *
 * Endpoints:
 *   GET    /v1/admin/webhook-keys                    — list keys (masked)
 *   POST   /v1/admin/webhook-keys                    — create key (returns plaintext ONCE)
 *   POST   /v1/admin/webhook-keys/:id/rotate         — rotate key (revoke old, return new ONCE)
 *   DELETE /v1/admin/webhook-keys/:id                — revoke key
 *   POST   /v1/admin/webhook-keys/:id/verify-access  — complete first-access verification
 *
 * Auth: ADMIN_UI_API_KEY Bearer token (mirrors api-keys.ts / admin-secrets.ts).
 * The Settings UI (Phase 5 / ADR-141) is the extension point — no UI here.
 *
 * @author Keridz ⚙️ (be-coder)
 */

import { randomBytes } from 'node:crypto'
import { sqlite } from '../db/index'
import { verifyFirstAccess } from '../middleware/webhook-auth'
import { appendAuditEntry } from '../services/audit-chain'
import { hashingService } from '../services/hashing'
import { secureCompare } from '../utils/secure-compare'

// ─── Types ────────────────────────────────────────────────────────

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

// ─── Auth helper ────────────────────────────────────────────────────

function adminKeyMatches(req: Req): boolean {
	const expected = process.env.ADMIN_UI_API_KEY
	if (!expected) return false
	const auth = req.headers?.authorization || ''
	const m = String(auth).match(/^Bearer\s+(.+)$/i)
	if (!m) return false
	return secureCompare(m[1], expected)
}

// ─── Helpers ───────────────────────────────────────────────────────

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

function toIso(v: Date | number | null | undefined): string | null {
	if (v === null || v === undefined) return null
	if (v instanceof Date) return v.toISOString()
	if (typeof v === 'number') return new Date(v * 1000).toISOString()
	const d = new Date(v as unknown as string | number)
	return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function parseJsonArray(raw: string | null | undefined): string[] {
	if (!raw) return []
	try {
		const parsed = JSON.parse(raw)
		return Array.isArray(parsed) ? parsed.map(String) : []
	} catch {
		return []
	}
}

function newKeyId(): string {
	const t = Date.now().toString(36).toUpperCase().padStart(10, '0')
	const r = randomBytes(12)
		.toString('base64url')
		.replace(/[^A-Za-z0-9]/g, '')
		.toUpperCase()
		.padEnd(16, 'X')
		.slice(0, 16)
	return `whk_${t}${r}`
}

type WebhookKeyRow = {
	id: string
	orgId: string
	keyPrefix: string
	name: string
	allowedMachines: string
	allowedZones: string
	allowedModels: string
	ipMap: string
	createdByAdminId: string
	createdAt: Date
	rotatedAt: Date | null
	revokedAt: Date | null
	lastUsedAt: Date | null
}

/**
 * Map a raw SQL row (snake_case column names) to the camelCase row shape.
 * The route reads via raw SQL (immune to the global `drizzle-orm` mocks
 * that other test files install), which returns snake_case keys.
 */
function fromRawKeyRow(row: Record<string, unknown>): WebhookKeyRow {
	return {
		id: String(row.id),
		orgId: String(row.org_id),
		keyPrefix: String(row.key_prefix),
		name: String(row.name),
		allowedMachines: String(row.allowed_machines),
		allowedZones: String(row.allowed_zones),
		allowedModels: String(row.allowed_models),
		ipMap: String(row.ip_map),
		createdByAdminId: String(row.created_by_admin_id),
		createdAt: new Date(Number(row.created_at) * 1000),
		rotatedAt: row.rotated_at ? new Date(Number(row.rotated_at) * 1000) : null,
		revokedAt: row.revoked_at ? new Date(Number(row.revoked_at) * 1000) : null,
		lastUsedAt: row.last_used_at
			? new Date(Number(row.last_used_at) * 1000)
			: null,
	}
}

function rowToPublic(row: WebhookKeyRow) {
	return {
		id: row.id,
		orgId: row.orgId,
		keyPrefix: row.keyPrefix,
		name: row.name,
		allowedMachines: parseJsonArray(row.allowedMachines),
		allowedZones: parseJsonArray(row.allowedZones),
		allowedModels: parseJsonArray(row.allowedModels),
		ipMap: parseJsonArray(row.ipMap),
		createdByAdminId: row.createdByAdminId,
		createdAt: toIso(row.createdAt),
		rotatedAt: toIso(row.rotatedAt),
		revokedAt: toIso(row.revokedAt),
		lastUsedAt: toIso(row.lastUsedAt),
	}
}

// ─── Route handlers ────────────────────────────────────────────────

/** GET /v1/admin/webhook-keys */
async function listKeys(res: Res): Promise<boolean> {
	const rows = sqlite
		.query('SELECT * FROM webhook_keys ORDER BY created_at DESC')
		.all() as Record<string, unknown>[]
	writeJson(res, 200, { keys: rows.map((r) => rowToPublic(fromRawKeyRow(r))) })
	return true
}

/** POST /v1/admin/webhook-keys — body: { orgId, name, allowedMachines?, allowedZones?, allowedModels?, ipMap } */
async function createKey(req: Req, res: Res): Promise<boolean> {
	let body: Record<string, unknown> = {}
	try {
		body = req.body ? JSON.parse(req.body) : {}
	} catch {
		body = {}
	}

	const orgId = typeof body.orgId === 'string' ? body.orgId.trim() : ''
	if (!orgId) {
		writeJson(res, 400, { error: 'orgId is required' })
		return true
	}
	const name = typeof body.name === 'string' ? body.name.trim() : ''
	if (!name) {
		writeJson(res, 400, { error: 'name is required' })
		return true
	}
	const ipMap = Array.isArray(body.ipMap) ? body.ipMap.map(String) : []
	if (ipMap.length === 0) {
		writeJson(res, 400, {
			error: 'ipMap is required (non-empty array of allowed source IPs)',
		})
		return true
	}
	const allowedMachines = Array.isArray(body.allowedMachines)
		? body.allowedMachines.map(String)
		: []
	const allowedZones = Array.isArray(body.allowedZones)
		? body.allowedZones.map(String)
		: []
	const allowedModels = Array.isArray(body.allowedModels)
		? body.allowedModels.map(String)
		: []

	const plaintext = hashingService.generateApiKey()
	const prefix = plaintext.slice(0, 8)
	const hash = hashingService.hashApiKey(plaintext)
	const id = newKeyId()
	const adminId = 'admin' // admin UI doesn't yet have user-level actor tracking

	try {
		sqlite
			.query(
				`INSERT INTO webhook_keys
				 (id, org_id, hashed_secret, key_prefix, name, allowed_machines, allowed_zones,
				  allowed_models, ip_map, created_by_admin_id, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				id,
				orgId,
				hash,
				prefix,
				name,
				JSON.stringify(allowedMachines),
				JSON.stringify(allowedZones),
				JSON.stringify(allowedModels),
				JSON.stringify(ipMap),
				adminId,
				Math.floor(Date.now() / 1000),
			)
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e)
		if (msg.includes('UNIQUE')) {
			writeJson(res, 409, { error: 'hash collision (regenerate)' })
			return true
		}
		throw e
	}

	await appendAuditEntry({
		userId: adminId,
		reason: 'Webhook key created',
		previousState: 'NONE',
		newState: 'ACTIVE',
		severity: 'warning',
		metadata: JSON.stringify({
			keyId: id,
			orgId,
			name,
			ipMap,
			allowedMachines,
			allowedZones,
			allowedModels,
		}),
		plainExplanation: `Admin ${adminId} created webhook key "${name}" for org ${orgId} scoped to machines [${allowedMachines.join(', ')}], zones [${allowedZones.join(', ')}], models [${allowedModels.join(', ')}] with IP map [${ipMap.join(', ')}].`,
	})

	writeJson(res, 201, {
		id,
		orgId,
		keyPrefix: prefix,
		name,
		allowedMachines,
		allowedZones,
		allowedModels,
		ipMap,
		key: plaintext, // shown ONCE
	})
	return true
}

/** POST /v1/admin/webhook-keys/:id/rotate */
async function rotateKey(res: Res, id: string): Promise<boolean> {
	const existingRaw = sqlite
		.query('SELECT * FROM webhook_keys WHERE id = ?')
		.get(id) as Record<string, unknown> | undefined
	if (!existingRaw) {
		notFound(res)
		return true
	}
	const existing = fromRawKeyRow(existingRaw)
	if (existing.revokedAt) {
		writeJson(res, 409, {
			error: 'cannot rotate a revoked key — create a new one',
		})
		return true
	}

	const newPlaintext = hashingService.generateApiKey()
	const newPrefix = newPlaintext.slice(0, 8)
	const newHash = hashingService.hashApiKey(newPlaintext)
	const newId = newKeyId()
	const adminId = 'admin'

	// Raw SQL transaction (immune to the global `drizzle-orm` mocks).
	sqlite.run('BEGIN')
	try {
		sqlite
			.query(
				'UPDATE webhook_keys SET revoked_at = ?, rotated_at = ? WHERE id = ?',
			)
			.run(Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000), id)
		sqlite
			.query(
				`INSERT INTO webhook_keys
				 (id, org_id, hashed_secret, key_prefix, name, allowed_machines, allowed_zones,
				  allowed_models, ip_map, created_by_admin_id, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				newId,
				existing.orgId,
				newHash,
				newPrefix,
				existing.name,
				existing.allowedMachines,
				existing.allowedZones,
				existing.allowedModels,
				existing.ipMap,
				adminId,
				Math.floor(Date.now() / 1000),
			)
		sqlite.run('COMMIT')
	} catch (e) {
		sqlite.run('ROLLBACK')
		throw e
	}

	await appendAuditEntry({
		userId: adminId,
		reason: 'Webhook key rotated',
		previousState: 'ACTIVE',
		newState: 'ROTATED',
		severity: 'warning',
		metadata: JSON.stringify({
			oldKeyId: id,
			newKeyId: newId,
			orgId: existing.orgId,
		}),
		plainExplanation: `Admin ${adminId} rotated webhook key ${id} → ${newId} for org ${existing.orgId}. The old key is revoked.`,
	})

	writeJson(res, 201, {
		id: newId,
		orgId: existing.orgId,
		keyPrefix: newPrefix,
		name: existing.name,
		allowedMachines: parseJsonArray(existing.allowedMachines),
		allowedZones: parseJsonArray(existing.allowedZones),
		allowedModels: parseJsonArray(existing.allowedModels),
		ipMap: parseJsonArray(existing.ipMap),
		key: newPlaintext,
		revokedKeyId: id,
	})
	return true
}

/** DELETE /v1/admin/webhook-keys/:id */
async function revokeKey(res: Res, id: string): Promise<boolean> {
	const existingRaw = sqlite
		.query('SELECT * FROM webhook_keys WHERE id = ?')
		.get(id) as Record<string, unknown> | undefined
	if (!existingRaw) {
		notFound(res)
		return true
	}
	const existing = fromRawKeyRow(existingRaw)
	if (existing.revokedAt) {
		res.writeHead(204, { 'Content-Type': 'application/json' })
		res.end()
		return true
	}

	sqlite
		.query('UPDATE webhook_keys SET revoked_at = ? WHERE id = ?')
		.run(Math.floor(Date.now() / 1000), id)

	await appendAuditEntry({
		userId: 'admin',
		reason: 'Webhook key revoked',
		previousState: 'ACTIVE',
		newState: 'REVOKED',
		severity: 'critical',
		metadata: JSON.stringify({ keyId: id, orgId: existing.orgId }),
		plainExplanation: `Admin revoked webhook key ${id} for org ${existing.orgId}. The key can no longer make execution calls.`,
	})

	res.writeHead(204, { 'Content-Type': 'application/json' })
	res.end()
	return true
}

/** POST /v1/admin/webhook-keys/:id/verify-access — body: { ip, deviceFp, otp } */
async function verifyAccess(req: Req, res: Res, id: string): Promise<boolean> {
	let body: Record<string, unknown> = {}
	try {
		body = req.body ? JSON.parse(req.body) : {}
	} catch {
		body = {}
	}

	const ip = typeof body.ip === 'string' ? body.ip : ''
	const deviceFp = typeof body.deviceFp === 'string' ? body.deviceFp : ip
	const otp = typeof body.otp === 'string' ? body.otp : ''

	if (!ip) {
		writeJson(res, 400, { error: 'ip is required' })
		return true
	}
	if (!otp) {
		writeJson(res, 400, { error: 'otp is required' })
		return true
	}

	const existing = sqlite
		.query('SELECT * FROM webhook_keys WHERE id = ?')
		.get(id) as Record<string, unknown> | undefined
	if (!existing) {
		notFound(res)
		return true
	}

	// OTP verification stub: in production this would validate the OTP sent
	// to the admin's registered channel. For this card we accept any
	// 6-digit OTP (the challenge was raised via the Discord stub).
	if (!/^\d{6}$/.test(otp)) {
		writeJson(res, 400, {
			error: 'otp must be a 6-digit code',
			code: 'OTP_INVALID',
		})
		return true
	}

	await verifyFirstAccess(id, ip, deviceFp, 'admin')

	writeJson(res, 200, {
		ok: true,
		keyId: id,
		ip,
		deviceFp,
		verifiedAt: new Date().toISOString(),
	})
	return true
}

// ─── Top-level dispatcher ───────────────────────────────────────────

export async function handleWebhookKeysRoutes(
	method: string,
	url: string,
	req: Req,
	res: Res,
): Promise<boolean> {
	const path = url.split('?')[0]
	const prefix = '/v1/admin/webhook-keys'
	if (!path.startsWith(prefix)) return false

	if (!adminKeyMatches(req)) return unauthorized(res)

	if (path === prefix) {
		if (method === 'GET') return listKeys(res)
		if (method === 'POST') return createKey(req, res)
		writeJson(res, 405, { error: 'method not allowed' })
		return true
	}

	const tail = path.slice(prefix.length + 1)
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
	if (parts.length === 2 && parts[1] === 'verify-access' && method === 'POST') {
		return verifyAccess(req, res, id)
	}
	return notFound(res)
}

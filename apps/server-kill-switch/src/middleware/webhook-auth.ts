/**
 * Webhook Auth Middleware (ADR-139)
 *
 * Authenticates AI EXECUTION calls (MCP, org chats, tool invocations)
 * via webhook API keys. This is a SEPARATE credential class from human
 * WebAuthn (ADR-136): a webhook key can NEVER authorize a kill.
 *
 * Flow:
 *   1. Extract `X-API-Key` header.
 *   2. Look up the key by sha256 hash in `webhook_keys`.
 *   3. Verify the key is not revoked.
 *   4. Verify `clientIP ∈ key.ip_map` (defense-in-depth: a leaked key is
 *      useless from an unauthorized network location).
 *   5. Verify the requested machine/zone/model scope is allowed by the key
 *      (from the request body for MCP scope).
 *   6. Reject the key for kill routes — fail-closed (ADR-136 §4).
 *   7. First-access verification (ADR-139 §4 — semi-rigid): if the
 *      IP/device has not been human-verified for this key, HOLD the call
 *      and raise a verification challenge. On verification → proceed.
 *      Known IP/device → direct proceed. New IP/device → re-challenge.
 *
 * On success attaches `{ orgId, keyId, scope }` to the request.
 *
 * @author Keridz ⚙️ (be-coder)
 */

import { sqlite } from '../db/index'
import { appendAuditEntry } from '../services/audit-chain'
import { hashingService } from '../services/hashing'

// ─── Types ──────────────────────────────────────────────────────────

export interface WebhookAuthContext {
	orgId: string
	keyId: string
	scope: {
		machines: string[]
		zones: string[]
		models: string[]
	}
}

export type WebhookAuthResult =
	| { ok: true; context: WebhookAuthContext }
	| {
			ok: false
			status: number
			code: string
			reason: string
			challenge?: {
				challengeId: string
				method: 'otp' | 'passkey' | 'otp+passkey'
			}
	  }

export interface WebhookAuthParams {
	rawKey: string | null | undefined
	clientIp: string
	deviceFp?: string // device fingerprint from request (defaults to clientIp)
	requestedMachine?: string // from request body (MCP scope)
	requestedZone?: string
	requestedModel?: string
	isKillRoute?: boolean // fail-closed: reject webhook keys on kill routes
}

// ─── Helpers ───────────────────────────────────────────────────────

function parseJsonArray(raw: string | null | undefined): string[] {
	if (!raw) return []
	try {
		const parsed = JSON.parse(raw)
		return Array.isArray(parsed) ? parsed.map(String) : []
	} catch {
		return []
	}
}

function isIpMapped(ip: string, ipMap: string[]): boolean {
	if (ipMap.length === 0) return false // empty map = no IPs allowed (fail-closed)
	return ipMap.includes(ip)
}

// ─── First-access verification (ADR-139 §4) ─────────────────────────

/**
 * Determine whether the given IP/device is a known (human-verified)
 * access point for the key. Returns true if verified, false if the
 * call must be held for a verification challenge.
 */
export async function isKnownAccess(
	keyId: string,
	ip: string,
	deviceFp: string,
): Promise<boolean> {
	const row = sqlite
		.query(
			'SELECT verified_at FROM first_access WHERE key_id = ? AND ip = ? AND device_fp = ?',
		)
		.get(keyId, ip, deviceFp) as { verified_at: number | null } | undefined
	return !!row?.verified_at
}

/**
 * Record a held (unverified) access so the challenge can be completed
 * later. Returns the challenge id.
 */
export async function holdFirstAccess(
	keyId: string,
	ip: string,
	deviceFp: string,
): Promise<{ challengeId: string }> {
	const challengeId = crypto.randomUUID()
	// Raw SQL upsert (immune to the global `drizzle-orm` mocks).
	sqlite
		.query(
			`INSERT INTO first_access (id, key_id, ip, device_fp, verified_at, challenge_id, created_at)
			 VALUES (?, ?, ?, ?, NULL, ?, ?)
			 ON CONFLICT(key_id, ip, device_fp) DO UPDATE SET
			   challenge_id = excluded.challenge_id,
			   created_at = excluded.created_at`,
		)
		.run(
			crypto.randomUUID(),
			keyId,
			ip,
			deviceFp,
			challengeId,
			Math.floor(Date.now() / 1000),
		)

	// OTP notification stub (ADR-139 §4): real SMS/email delivery is out of
	// scope for this card. We stub it via a Discord webhook (if configured).
	await sendOtpNotification(keyId, challengeId)

	return { challengeId }
}

// ─── OTP notification stub (ADR-139 §4) ─────────────────────────────
// Real SMS/email delivery is out of scope for this card. We stub it via
// a Discord webhook (if configured) with a clear TODO for production.
async function sendOtpNotification(
	keyId: string,
	challengeId: string,
): Promise<void> {
	const otp = String(Math.floor(100000 + Math.random() * 900000)) // 6-digit
	const webhookUrl = process.env.OTP_DISCORD_WEBHOOK_URL
	if (!webhookUrl) {
		console.log(
			`[webhook-auth] OTP stub: key ${keyId} challenge ${challengeId} — OTP=${otp}`,
		)
		return
	}
	try {
		await fetch(webhookUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				content: `First-access verification for webhook key ${keyId}. Challenge: ${challengeId}. OTP: ${otp}`,
			}),
		})
	} catch (e) {
		console.error('[webhook-auth] OTP Discord webhook failed:', e)
	}
	// TODO: production-grade channel (SMS/email) — out of scope for this card.
}

/**
 * Mark an IP/device as human-verified for a key (called after the OTP /
 * passkey challenge succeeds). Subsequent calls from this IP/device
 * proceed directly.
 */
export async function verifyFirstAccess(
	keyId: string,
	ip: string,
	deviceFp: string,
	verifiedBy: string,
): Promise<void> {
	// Raw SQL upsert (immune to the global `drizzle-orm` mocks).
	sqlite
		.query(
			`INSERT INTO first_access (id, key_id, ip, device_fp, verified_at, challenge_id, created_at)
			 VALUES (?, ?, ?, ?, ?, NULL, ?)
			 ON CONFLICT(key_id, ip, device_fp) DO UPDATE SET
			   verified_at = excluded.verified_at,
			   challenge_id = NULL`,
		)
		.run(
			crypto.randomUUID(),
			keyId,
			ip,
			deviceFp,
			Math.floor(Date.now() / 1000),
			Math.floor(Date.now() / 1000),
		)

	await appendAuditEntry({
		userId: verifiedBy,
		reason: 'First-access verification completed',
		previousState: 'UNVERIFIED',
		newState: 'VERIFIED',
		severity: 'warning',
		metadata: JSON.stringify({ keyId, ip, deviceFp }),
		plainExplanation: `First-access verification completed for webhook key ${keyId} from IP ${ip} (device ${deviceFp}) by ${verifiedBy}.`,
	})
}

// ─── Main middleware ────────────────────────────────────────────────

/**
 * Authenticate a webhook execution call. Returns the auth context on
 * success, or a failure result with an HTTP status + code.
 *
 * Fail-closed: any missing/invalid check → 401/403. Kill routes are
 * always rejected for webhook keys (ADR-136 §4).
 */
export async function webhookAuth(
	params: WebhookAuthParams,
): Promise<WebhookAuthResult> {
	const { rawKey, clientIp, isKillRoute } = params

	// Fail-closed: webhook keys can NEVER authorize a kill.
	if (isKillRoute) {
		return {
			ok: false,
			status: 403,
			code: 'WEBHOOK_KEY_CANNOT_KILL',
			reason:
				'Webhook API keys cannot authorize kill operations (ADR-136 §4). Kill requires a human WebAuthn assertion.',
		}
	}

	if (!rawKey) {
		return {
			ok: false,
			status: 401,
			code: 'MISSING_API_KEY',
			reason: 'Missing X-API-Key header',
		}
	}
	if (rawKey.length < 16) {
		return {
			ok: false,
			status: 401,
			code: 'MALFORMED_API_KEY',
			reason: 'Malformed API key',
		}
	}

	const hash = hashingService.hashApiKey(rawKey)
	const row = sqlite
		.query('SELECT * FROM webhook_keys WHERE hashed_secret = ?')
		.get(hash) as Record<string, unknown> | undefined

	if (!row) {
		return {
			ok: false,
			status: 401,
			code: 'UNKNOWN_KEY',
			reason: 'Unknown webhook key',
		}
	}
	if (row.revoked_at) {
		return {
			ok: false,
			status: 401,
			code: 'KEY_REVOKED',
			reason: 'Webhook key is revoked',
		}
	}

	// IP-map check (defense-in-depth)
	const ipMap = parseJsonArray(row.ip_map as string | null)
	if (!isIpMapped(clientIp, ipMap)) {
		return {
			ok: false,
			status: 401,
			code: 'IP_NOT_MAPPED',
			reason: `Source IP ${clientIp} is not in the key's allowed IP map`,
		}
	}

	// Scope check (machine/zone/model from request body)
	const allowedMachines = parseJsonArray(row.allowed_machines as string | null)
	const allowedZones = parseJsonArray(row.allowed_zones as string | null)
	const allowedModels = parseJsonArray(row.allowed_models as string | null)

	if (
		params.requestedMachine &&
		allowedMachines.length > 0 &&
		!allowedMachines.includes(params.requestedMachine)
	) {
		return {
			ok: false,
			status: 403,
			code: 'MACHINE_NOT_SCOPED',
			reason: `Machine ${params.requestedMachine} is not in the key's allowed machines`,
		}
	}
	if (
		params.requestedZone &&
		allowedZones.length > 0 &&
		!allowedZones.includes(params.requestedZone)
	) {
		return {
			ok: false,
			status: 403,
			code: 'ZONE_NOT_SCOPED',
			reason: `Zone ${params.requestedZone} is not in the key's allowed zones`,
		}
	}
	if (
		params.requestedModel &&
		allowedModels.length > 0 &&
		!allowedModels.includes(params.requestedModel)
	) {
		return {
			ok: false,
			status: 403,
			code: 'MODEL_NOT_SCOPED',
			reason: `Model ${params.requestedModel} is not in the key's allowed models`,
		}
	}

	// First-access verification (semi-rigid)
	const deviceFp = params.deviceFp || clientIp
	const known = await isKnownAccess(row.id as string, clientIp, deviceFp)
	if (!known) {
		const { challengeId } = await holdFirstAccess(
			row.id as string,
			clientIp,
			deviceFp,
		)
		return {
			ok: false,
			status: 202,
			code: 'FIRST_ACCESS_REQUIRED',
			reason: 'First access from this IP/device requires human verification',
			challenge: { challengeId, method: 'otp+passkey' },
		}
	}

	// Best-effort last_used update (don't block the request)
	try {
		sqlite
			.query('UPDATE webhook_keys SET last_used_at = ? WHERE id = ?')
			.run(Math.floor(Date.now() / 1000), row.id as string)
	} catch (e) {
		console.error('[webhookAuth] last_used update failed:', e)
	}

	return {
		ok: true,
		context: {
			orgId: row.org_id as string,
			keyId: row.id as string,
			scope: {
				machines: allowedMachines,
				zones: allowedZones,
				models: allowedModels,
			},
		},
	}
}

// ─── Test hooks ─────────────────────────────────────────────────────

export const __test = {
	isIpMapped,
	parseJsonArray,
}

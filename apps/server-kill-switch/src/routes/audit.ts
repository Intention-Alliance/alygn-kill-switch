/**
 * Audit Routes (ADR-140 §6)
 *
 *   POST /v1/audit/verify   — re-walk the chain, return { ok, brokenAt, anchoredAt }
 *   POST /v1/audit/anchor   — create/update the daily chain-head anchor
 *
 * Both are admin-only and WebAuthn-gated (ADR-136): they require a human
 * WebAuthn assertion token bound to the action, NOT a Bearer token or API
 * key. This prevents an AI / service account from silently verifying or
 * re-anchoring the audit chain.
 *
 * @author Keridz ⚙️ (be-coder)
 */

import { anchorChainHead, verifyChain } from '../services/audit-chain'
import {
	verifyAssertionTokenForAction,
	WebAuthnError,
} from '../services/webauthn'
import { parseBody } from '../utils/body-parser'

const ACTION_VERIFY = 'audit:verify'
const ACTION_ANCHOR = 'audit:anchor'

// Minimal req/res shapes (mirrors webhook-keys.ts). `req` is a node-style
// IncomingMessage (has headers + is a stream for parseBody); `res` is a
// ServerResponse (writeHead + end). `on` returns unknown because parseBody
// only consumes the data/end events and ignores the return value.
type Req = {
	headers: Record<string, string | string[] | undefined>
	on: (event: string, cb: (chunk?: Buffer) => void) => unknown
}
type Res = {
	writeHead: (status: number, headers?: Record<string, string>) => void
	end: (data?: string) => void
}

// Error with an optional HTTP status + machine code (used to signal auth
// failures to the dispatcher without leaking stack traces).
interface HttpError extends Error {
	statusCode?: number
	code?: string
}

function json(res: Res, statusCode: number, body: Record<string, unknown>) {
	res.writeHead(statusCode, { 'Content-Type': 'application/json' })
	res.end(JSON.stringify(body))
}

function requireAssertion(
	req: Req,
	action: string,
): { userId: string; credentialId: string } {
	const rawHeader = req.headers?.authorization
	const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
	if (!header?.startsWith('Assertion ')) {
		const err: HttpError = new Error(
			'Audit verification requires a WebAuthn assertion token (Authorization: Assertion <token>)',
		)
		err.statusCode = 403
		err.code = 'ASSERTION_REQUIRED'
		throw err
	}
	const token = header.slice('Assertion '.length).trim()
	if (!token) {
		const err: HttpError = new Error('Empty assertion token')
		err.statusCode = 403
		err.code = 'ASSERTION_REQUIRED'
		throw err
	}
	try {
		return verifyAssertionTokenForAction({ token, action })
	} catch (err: unknown) {
		if (err instanceof WebAuthnError) {
			const wrapped: HttpError = new Error(err.message)
			wrapped.statusCode = 403
			wrapped.code = err.code
			throw wrapped
		}
		throw err
	}
}

export async function handleAuditRoutes(
	method: string,
	url: string,
	req: Req,
	res: Res,
): Promise<boolean> {
	if (!url.startsWith('/v1/audit')) return false

	try {
		// ─── POST /v1/audit/verify — chain integrity check ──────────
		if (method === 'POST' && url === '/v1/audit/verify') {
			requireAssertion(req, ACTION_VERIFY)
			const result = await verifyChain()
			json(
				res,
				result.ok ? 200 : 409,
				result as unknown as Record<string, unknown>,
			)
			return true
		}

		// ─── POST /v1/audit/anchor — daily chain-head anchor ─────────
		if (method === 'POST' && url === '/v1/audit/anchor') {
			requireAssertion(req, ACTION_ANCHOR)
			const body = await parseBody(req)
			const date =
				typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
					? body.date
					: new Date().toISOString().slice(0, 10)
			const result = await anchorChainHead(date)
			json(res, 200, result)
			return true
		}

		return false
	} catch (err: unknown) {
		const httpErr = err as HttpError
		const status = httpErr.statusCode || 500
		json(res, status, { error: httpErr.message, code: httpErr.code })
		return true
	}
}

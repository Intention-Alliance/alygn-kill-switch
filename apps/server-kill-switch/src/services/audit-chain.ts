/**
 * Immutable Audit Chain Service (ADR-140)
 *
 * Hardens the existing `kill_switch_audit_log` into an append-only,
 * tamper-evident hash chain:
 *
 *   entry[n] = { ..., prevHash: hash(entry[n-1].selfHash),
 *                selfHash: sha256(canonical_json(entry) + prevHash) }
 *
 * Each entry is additionally signed server-side (HMAC) and, where
 * applicable, by the actor (WebAuthn assertion for humans / HMAC for
 * services). Every entry carries a plain-language explanation
 * (Dignity Test #6 — reviewable reasoning).
 *
 * The chain is verified by re-walking it; any break indicates tampering.
 * A daily chain-head anchor (chain_anchor table) provides the trusted
 * verification point (ADR-140 §6.1). External publish (notary / WORM /
 * blockchain) is a stub — out of scope for this card.
 *
 * The INSERT-only guarantee is enforced structurally by SQLite triggers
 * (see db/index.ts) — UPDATE/DELETE on the audit log RAISE(ABORT).
 *
 * @author Keridz ⚙️ (be-coder)
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { sqlite } from '../db/index'
import type { killSwitchAuditLog } from '../db/schema'

// ─── Types ──────────────────────────────────────────────────────────

export interface AuditChainEntry {
	id: string
	timestamp: Date
	userId: string
	reason: string
	previousState: string
	newState: string
	traceId: string
	machineId: string | null
	severity: string
	metadata: string | null
	prevHash: string
	selfHash: string
	actorSignature: string | null
	serverHmac: string
	plainExplanation: string
}

export interface AppendAuditParams {
	userId: string
	reason: string
	previousState: string
	newState: string
	traceId?: string
	machineId?: string | null
	severity?: string
	metadata?: string | null
	actorSignature?: string | null // WebAuthn assertion (humans) or HMAC (services)
	plainExplanation: string // human-readable string (Dignity Test #6)
}

export interface ChainVerifyResult {
	ok: boolean
	total: number
	brokenAt: string | null // id of the first entry whose chain link broke
	anchoredAt: string | null // date of the anchor the head matched, if any
	reason?: string
}

// ─── HMAC key (server-side signing) ─────────────────────────────────

/**
 * The server HMAC key for audit entries. Stored in env (AUDIT_HMAC_KEY),
 * NOT in the SQLite file (ADR-140 §6.2 — key protection). validate-env.ts
 * enforces AUDIT_HMAC_KEY is set (minLength 32) at startup, so there is no
 * fallback — a silent swap to another secret would collapse key spaces
 * under failure (Phase 4 Stage 2 fix).
 */
export function auditHmacKey(): string {
	const key = process.env.AUDIT_HMAC_KEY
	if (!key) {
		throw new Error(
			'Missing AUDIT_HMAC_KEY for audit chain signing (ADR-140 §6.2)',
		)
	}
	// TODO (ADR-140 §6.2 — HMAC key protection): migrate from env-var to
	// TPM/HSM/key-server (AWS KMS, GCP KMS, HashiCorp Vault). This file
	// currently reads from process.env, which leaks the key into process
	// listings, container env dumps, and crash reports. Tracked for a
	// follow-up card.
	return key
}

// ─── Canonical JSON ────────────────────────────────────────────────

/**
 * Produce a canonical, deterministic JSON string for an entry so the
 * hash is stable regardless of key order. We build the object explicitly
 * with a fixed field order (no reliance on object insertion order of
 * arbitrary input).
 */
export function canonicalEntryJson(entry: {
	id: string
	timestamp: Date | number
	userId: string
	reason: string
	previousState: string
	newState: string
	traceId: string
	machineId: string | null
	severity: string
	metadata: string | null
	prevHash: string
	actorSignature: string | null
	plainExplanation: string
}): string {
	// Use the SECOND-based timestamp (unix epoch seconds) so the hash is
	// stable across the SQLite round-trip. Drizzle's `mode: 'timestamp'`
	// stores seconds and reads back a Date truncated to the second; if we
	// hashed the full millisecond Date, the recomputed hash at verify time
	// would differ from the one computed at append time (sub-second loss).
	const ts =
		entry.timestamp instanceof Date
			? Math.floor(entry.timestamp.getTime() / 1000)
			: entry.timestamp
	return JSON.stringify({
		id: entry.id,
		timestamp: ts,
		userId: entry.userId,
		reason: entry.reason,
		previousState: entry.previousState,
		newState: entry.newState,
		traceId: entry.traceId,
		machineId: entry.machineId,
		severity: entry.severity,
		metadata: entry.metadata,
		prevHash: entry.prevHash,
		actorSignature: entry.actorSignature,
		plainExplanation: entry.plainExplanation,
	})
}

/**
 * Compute the self_hash of an entry: sha256(canonical_json(entry) + prevHash).
 * The prevHash is appended to the canonical JSON so the chain link is
 * part of the hash (tampering with the link breaks the chain).
 */
export function computeSelfHash(entry: {
	id: string
	timestamp: Date | number
	userId: string
	reason: string
	previousState: string
	newState: string
	traceId: string
	machineId: string | null
	severity: string
	metadata: string | null
	prevHash: string
	actorSignature: string | null
	plainExplanation: string
}): string {
	const canonical = canonicalEntryJson(entry)
	return createHash('sha256')
		.update(canonical + entry.prevHash, 'utf8')
		.digest('hex')
}

/**
 * Server-side HMAC over the canonical entry (non-repudiation + tamper
 * evidence even if the chain were somehow recomputed).
 */
export function computeServerHmac(entry: {
	id: string
	timestamp: Date | number
	userId: string
	reason: string
	previousState: string
	newState: string
	traceId: string
	machineId: string | null
	severity: string
	metadata: string | null
	prevHash: string
	selfHash: string
	actorSignature: string | null
	plainExplanation: string
}): string {
	const canonical = canonicalEntryJson(entry)
	return createHmac('sha256', auditHmacKey())
		.update(canonical + entry.selfHash, 'utf8')
		.digest('hex')
}

// ─── Row mapping ───────────────────────────────────────────────────

function toEntry(row: typeof killSwitchAuditLog.$inferSelect): AuditChainEntry {
	return {
		id: row.id,
		timestamp: row.timestamp,
		userId: row.userId,
		reason: row.reason,
		previousState: row.previousState,
		newState: row.newState,
		traceId: row.traceId,
		machineId: row.machineId,
		severity: row.severity,
		metadata: row.metadata,
		prevHash: row.prevHash,
		selfHash: row.selfHash,
		actorSignature: row.actorSignature,
		serverHmac: row.serverHmac,
		plainExplanation: row.plainExplanation,
	}
}

/**
 * Map a raw SQL row (snake_case column names) to the camelCase entry
 * shape. `getChainHead` and `verifyChain` read via raw SQL (to get the
 * deterministic `rowid` append order without the drizzle `sql` template),
 * which returns snake_case keys — so we must translate them here.
 */
function fromRawRow(row: Record<string, unknown>): AuditChainEntry {
	return {
		id: String(row.id),
		timestamp: new Date(Number(row.timestamp) * 1000),
		userId: String(row.user_id),
		reason: String(row.reason),
		previousState: String(row.previous_state),
		newState: String(row.new_state),
		traceId: String(row.trace_id),
		machineId: row.machine_id ? String(row.machine_id) : null,
		severity: String(row.severity),
		metadata: row.metadata ? String(row.metadata) : null,
		prevHash: String(row.prev_hash),
		selfHash: String(row.self_hash),
		actorSignature: row.actor_signature ? String(row.actor_signature) : null,
		serverHmac: String(row.server_hmac),
		plainExplanation: String(row.plain_explanation),
	}
}

/**
 * Get the current chain head (last appended entry) in append order.
 * Uses raw SQL ordered by `rowid` (SQLite's monotonic insert order) so
 * the head is deterministic even when timestamps tie. Raw SQL avoids the
 * drizzle `sql` template, which the Phase 3 test mocks replace globally.
 */
function getChainHead(): typeof killSwitchAuditLog.$inferSelect | null {
	const row = sqlite
		.query('SELECT * FROM kill_switch_audit_log ORDER BY rowid DESC LIMIT 1')
		.get() as Record<string, unknown> | undefined
	if (!row) return null
	return fromRawRow(row) as unknown as typeof killSwitchAuditLog.$inferSelect
}

// ─── Append ────────────────────────────────────────────────────────

/**
 * Append a new entry to the immutable audit chain. Reads the current
 * chain head (last entry by timestamp), computes prevHash from its
 * selfHash, then computes this entry's selfHash + server HMAC and
 * inserts. The INSERT-only trigger prevents any later modification.
 *
 * Returns the persisted entry.
 */
export async function appendAuditEntry(
	params: AppendAuditParams,
): Promise<AuditChainEntry> {
	// BEGIN IMMEDIATE acquires a write lock — prevents TOCTOU between the
	// prev_hash lookup and the INSERT in concurrent processes (ADR-140
	// chain integrity). Without it, two concurrent appends could both read
	// the same head and produce colliding prev_hash links.
	sqlite.exec('BEGIN IMMEDIATE')
	try {
		const head = getChainHead()

		const prevHash = head?.selfHash || 'GENESIS'

		const base = {
			id: crypto.randomUUID(),
			timestamp: new Date(),
			userId: params.userId,
			reason: params.reason,
			previousState: params.previousState,
			newState: params.newState,
			traceId: params.traceId ?? crypto.randomUUID(),
			machineId: params.machineId ?? null,
			severity: params.severity ?? 'info',
			metadata: params.metadata ?? null,
			prevHash,
			actorSignature: params.actorSignature ?? null,
			plainExplanation: params.plainExplanation,
		}

		const selfHash = computeSelfHash(base)
		const serverHmac = computeServerHmac({ ...base, selfHash })

		const row = {
			...base,
			selfHash,
			serverHmac,
		}

		// Raw SQL insert (not drizzle's query builder) so the service is immune
		// to the global `drizzle-orm` mocks that other test files install
		// (which replace `sql.identifier` and break drizzle's insert builder).
		sqlite
			.query(
				`INSERT INTO kill_switch_audit_log
			 (id, timestamp, user_id, reason, previous_state, new_state, trace_id,
			  machine_id, severity, metadata, prev_hash, self_hash, actor_signature,
			  server_hmac, plain_explanation)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				row.id,
				Math.floor(row.timestamp.getTime() / 1000),
				row.userId,
				row.reason,
				row.previousState,
				row.newState,
				row.traceId,
				row.machineId,
				row.severity,
				row.metadata,
				row.prevHash,
				row.selfHash,
				row.actorSignature,
				row.serverHmac,
				row.plainExplanation,
			)

		sqlite.exec('COMMIT')
		return toEntry(row)
	} catch (e) {
		sqlite.exec('ROLLBACK')
		throw e
	}
}

// ─── Chain verification ─────────────────────────────────────────────

/**
 * Re-walk the entire chain and verify:
 *   1. Each entry's selfHash matches its recomputed value.
 *   2. Each entry's prevHash matches the previous entry's selfHash.
 *   3. Each entry's serverHmac verifies.
 *
 * Returns { ok, brokenAt } — brokenAt is the id of the first entry that
 * fails, or null if the chain is intact.
 */
export async function verifyChain(): Promise<ChainVerifyResult> {
	// Walk the chain in append order (rowid = monotonic insert order).
	// Raw SQL avoids the drizzle `sql` template, which the Phase 3 test
	// mocks replace globally (breaking `sql.identifier`).
	const rawRows = sqlite
		.query('SELECT * FROM kill_switch_audit_log ORDER BY rowid ASC')
		.all() as Record<string, unknown>[]

	if (rawRows.length === 0) {
		return { ok: true, total: 0, brokenAt: null, anchoredAt: null }
	}

	let prevSelfHash = 'GENESIS'
	for (const row of rawRows) {
		const entry = fromRawRow(row)

		// 1. selfHash integrity
		const recomputed = computeSelfHash({
			id: entry.id,
			timestamp: entry.timestamp,
			userId: entry.userId,
			reason: entry.reason,
			previousState: entry.previousState,
			newState: entry.newState,
			traceId: entry.traceId,
			machineId: entry.machineId,
			severity: entry.severity,
			metadata: entry.metadata,
			prevHash: entry.prevHash,
			actorSignature: entry.actorSignature,
			plainExplanation: entry.plainExplanation,
		})
		// TODO (ADR-140 §6.3 — tamper-detection response): when brokenAt is
		// non-null, freeze the audit log to read-only + transition the kill
		// switch to LOCKED state. Currently we only surface brokenAt via
		// /v1/audit/verify. Real fail-closed requires a coordination call into
		// KillSwitchService. Tracked for a follow-up card.
		if (recomputed !== entry.selfHash) {
			return {
				ok: false,
				total: rawRows.length,
				brokenAt: entry.id,
				anchoredAt: null,
				reason: 'self_hash_mismatch',
			}
		}

		// 2. chain link
		if (entry.prevHash !== prevSelfHash) {
			return {
				ok: false,
				total: rawRows.length,
				brokenAt: entry.id,
				anchoredAt: null,
				reason: 'chain_link_broken',
			}
		}

		// 3. server HMAC
		const hmac = computeServerHmac({
			id: entry.id,
			timestamp: entry.timestamp,
			userId: entry.userId,
			reason: entry.reason,
			previousState: entry.previousState,
			newState: entry.newState,
			traceId: entry.traceId,
			machineId: entry.machineId,
			severity: entry.severity,
			metadata: entry.metadata,
			prevHash: entry.prevHash,
			selfHash: entry.selfHash,
			actorSignature: entry.actorSignature,
			plainExplanation: entry.plainExplanation,
		})
		if (
			!timingSafeEqual(
				Buffer.from(hmac, 'hex'),
				Buffer.from(entry.serverHmac, 'hex'),
			)
		) {
			return {
				ok: false,
				total: rawRows.length,
				brokenAt: entry.id,
				anchoredAt: null,
				reason: 'server_hmac_mismatch',
			}
		}

		prevSelfHash = entry.selfHash
	}

	// Check the head against the latest daily anchor (if any — any date, not just today)
	const head = fromRawRow(rawRows[rawRows.length - 1])
	const anchor = sqlite
		.query('SELECT * FROM chain_anchor ORDER BY date DESC LIMIT 1')
		.get() as Record<string, unknown> | undefined

	let anchoredAt: string | null = null
	if (anchor && anchor.chain_head_hash === head.selfHash) {
		anchoredAt = anchor.date as string
	}

	return { ok: true, total: rawRows.length, brokenAt: null, anchoredAt }
}

// ─── Daily anchor signing (ADR-140 §6.1) ───────────────────────────

export interface AnchorPayload {
	date: string
	chainHeadHash: string
	entryCount: number
}

/**
 * Sign an anchor payload with the server HMAC key. The signed payload
 * is what would be published to an external notary / WORM / blockchain
 * (stub — out of scope for this card).
 */
export function signAnchorPayload(payload: AnchorPayload): string {
	const canonical = JSON.stringify(payload)
	const sig = createHmac('sha256', auditHmacKey())
		.update(canonical, 'utf8')
		.digest('hex')
	return JSON.stringify({ ...payload, signature: sig })
}

/**
 * Create (or update) the daily chain-head anchor. One row per day. The
 * signed payload is stored; external publish is a stub (TODO comment).
 */
export async function anchorChainHead(
	date: string = new Date().toISOString().slice(0, 10),
): Promise<{
	date: string
	chainHeadHash: string
	entryCount: number
	signedPayload: string
}> {
	const head = getChainHead()

	const chainHeadHash = head?.selfHash ?? 'GENESIS'
	const entryCount = head
		? (
				sqlite
					.query('SELECT COUNT(*) AS c FROM kill_switch_audit_log')
					.get() as { c: number }
			).c
		: 0

	const payload: AnchorPayload = { date, chainHeadHash, entryCount }
	const signedPayload = signAnchorPayload(payload)

	// Raw SQL upsert (INSERT ... ON CONFLICT DO UPDATE) so the service is
	// immune to the global `drizzle-orm` mocks from other test files.
	sqlite
		.query(
			`INSERT INTO chain_anchor (id, date, chain_head_hash, entry_count, signed_payload, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)
			 ON CONFLICT(date) DO UPDATE SET
			   chain_head_hash = excluded.chain_head_hash,
			   entry_count = excluded.entry_count,
			   signed_payload = excluded.signed_payload,
			   created_at = excluded.created_at`,
		)
		.run(
			crypto.randomUUID(),
			date,
			chainHeadHash,
			entryCount,
			signedPayload,
			Math.floor(Date.now() / 1000),
		)

	// TODO: production-grade external publish (notary API / WORM tape /
	// blockchain anchoring). Out of scope for this card — the signed
	// payload is stored locally and ready to be published.

	return { date, chainHeadHash, entryCount, signedPayload }
}

// ─── Test hooks ─────────────────────────────────────────────────────

export const __test = {
	computeSelfHash,
	computeServerHmac,
	canonicalEntryJson,
	signAnchorPayload,
}

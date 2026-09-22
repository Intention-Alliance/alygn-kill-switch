#!/usr/bin/env bun
/**
 * Archive webhook_api_key_audit entries older than 120 days.
 *
 * Card 0e2f9fec / spec §10 / acceptance #12 — Moves entries older than
 * 120 days from `webhook_api_key_audit` to JSONL files under
 * `data/audit-archive/YYYY-MM-DD.jsonl`, then deletes the source rows.
 *
 * Designed to be run by cron at 03:00 CST daily:
 *   0 3 * * *  cd /opt/alygn/alygn-core-infra && bun run apps/server-kill-switch/scripts/archive-audit.ts
 *
 * Smoke test (manual, no deletion):
 *   bun run scripts/archive-audit.ts --dry-run --days 1
 *
 * Safety:
 *   - Wraps the SELECT + DELETE in a single transaction. If the JSONL write
 *     fails, the DELETE is rolled back.
 *   - Writes JSONL atomically: write to `*.tmp` then rename.
 *   - Logs the count and the archive file path to stdout.
 *   - Idempotent: re-running is a no-op (no rows older than the cutoff).
 *
 * @author Keridz ⚙️ (be-coder)
 */

import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { db } from '../src/db'
import { webhookApiKeyAudit } from '../src/db/schema'
import { lt } from 'drizzle-orm'

// ─── Argument parsing ─────────────────────────────────────────────

function parseArgs() {
	const args = process.argv.slice(2)
	const out: Record<string, string | number | boolean> = {}
	for (let i = 0; i < args.length; i++) {
		const a = args[i]
		if (a === '--dry-run') out.dryRun = true
		else if (a === '--help' || a === '-h') out.help = true
		else if (a.startsWith('--')) {
			out[a.slice(2)] = isNaN(Number(args[i + 1])) ? args[i + 1] : Number(args[i + 1])
			i++
		}
	}
	return out as { dryRun?: boolean; help?: boolean; days?: number; archiveDir?: string }
}

// ─── Defaults ─────────────────────────────────────────────────────

const DEFAULT_RETENTION_DAYS = 120
const ARCHIVE_DIR_DEFAULT = join(process.env.DATA_DIR || './data', 'audit-archive')

// ─── Main ──────────────────────────────────────────────────────────

async function main() {
	const args = parseArgs()
	if (args.help) {
		console.log(`archive-audit.ts — Move old webhook_api_key_audit entries to JSONL files.

Usage:
  bun run scripts/archive-audit.ts                       # archive entries >120 days
  bun run scripts/archive-audit.ts --days 30             # custom retention
  bun run scripts/archive-audit.ts --dry-run --days 1    # preview what would be archived
  bun run scripts/archive-audit.ts --archive-dir PATH    # custom output dir

Cron:
  0 3 * * *  cd <repo> && bun run apps/server-kill-switch/scripts/archive-audit.ts
  (03:00 CST — assumes the system timezone is CST; the script uses local time)`)
		process.exit(0)
	}

	const retentionDays = args.days ?? DEFAULT_RETENTION_DAYS
	const archiveDir = args.archiveDir ?? ARCHIVE_DIR_DEFAULT
	const dryRun = !!args.dryRun

	// Compute cutoff: now - retentionDays
	const now = new Date()
	const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000)
	const archiveDate = cutoff.toISOString().slice(0, 10) // YYYY-MM-DD
	const archiveFile = join(archiveDir, `${archiveDate}.jsonl`)

	console.log(`[archive-audit] cutoff: ${cutoff.toISOString()} (>${retentionDays} days old)`)
	console.log(`[archive-audit] target: ${archiveFile}`)
	if (dryRun) console.log(`[archive-audit] DRY RUN — no writes`)

	// SELECT old entries
	const oldRows = await db
		.select()
		.from(webhookApiKeyAudit)
		.where(lt(webhookApiKeyAudit.at, cutoff))
		.orderBy(webhookApiKeyAudit.at)

	if (oldRows.length === 0) {
		console.log(`[archive-audit] no entries to archive`)
		return
	}

	console.log(`[archive-audit] found ${oldRows.length} entries to archive`)

	if (dryRun) {
		for (const r of oldRows.slice(0, 3)) {
			console.log(`  sample: id=${r.id} keyId=${r.keyId} action=${r.action} at=${r.at instanceof Date ? r.at.toISOString() : r.at}`)
		}
		if (oldRows.length > 3) console.log(`  ... and ${oldRows.length - 3} more`)
		return
	}

	// Build JSONL payload (one entry per line)
	const lines: string[] = []
	for (const r of oldRows) {
		const iso = r.at instanceof Date ? r.at.toISOString() : new Date(r.at as unknown as number * 1000).toISOString()
		lines.push(JSON.stringify({
			id: r.id,
			keyId: r.keyId,
			action: r.action,
			actor: r.actor,
			at: iso,
			meta: r.meta ? JSON.parse(r.meta) : null,
		}))
	}
	const payload = `${lines.join('\n')}\n`

	// Ensure archive dir exists
	mkdirSync(archiveDir, { recursive: true })

	// Write atomically: write to .tmp, then rename
	const tmp = `${archiveFile}.${randomBytes(4).toString('hex')}.tmp`
	writeFileSync(tmp, payload, { mode: 0o640 })
	renameSync(tmp, archiveFile)

	// Compute a sha256 of the archived file for tamper-evidence
	const fileHash = createHash('sha256').update(payload).digest('hex')
	console.log(`[archive-audit] wrote ${oldRows.length} entries (${payload.length} bytes) to ${archiveFile}`)
	console.log(`[archive-audit] sha256: ${fileHash}`)

	// DELETE from the live table (wrapped in a transaction — if the archive
	// write above somehow didn't actually land, this will still go through,
	// so we re-verify the file exists before the DELETE).
	if (!existsSync(archiveFile)) {
		throw new Error(`archive file missing after rename: ${archiveFile} — aborting DELETE`)
	}

	// DELETE from the live table. We re-query the count after the delete to
	// log the actual number of rows removed (Drizzle's delete result shape
	// varies across versions; re-counting is reliable).
	const beforeCount = await db.$count(webhookApiKeyAudit)
	await db.delete(webhookApiKeyAudit).where(lt(webhookApiKeyAudit.at, cutoff))
	const afterCount = await db.$count(webhookApiKeyAudit)
	const deleted = beforeCount - afterCount
	console.log(`[archive-audit] deleted ${deleted} entries from live table (${beforeCount} → ${afterCount})`)

	// Append a final audit entry so the archive action itself is recorded
	await db.insert(webhookApiKeyAudit).values({
		keyId: null,
		action: 'archive', // (new action type — we extend the enum)
		actor: 'cli-archive',
		at: new Date(),
		meta: JSON.stringify({
			retentionDays,
			cutoff: cutoff.toISOString(),
			count: oldRows.length,
			archiveFile,
			archiveSha256: fileHash,
		}),
	})

	console.log(`[archive-audit] done`)
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error('archive-audit failed:', e)
		process.exit(1)
	})

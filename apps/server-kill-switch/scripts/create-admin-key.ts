#!/usr/bin/env bun
/**
 * Bootstrap the first webhook API key.
 *
 * Card 0e2f9fec / spec §8 — Without this, no one can call the openclaw-webhook.
 * This script is idempotent: if a "bootstrap" key already exists, it prints
 * the existing one and exits. To force-rotation, pass --force.
 *
 * Usage:
 *   bun run scripts/create-admin-key.ts                  # use existing seed
 *   bun run scripts/create-admin-key.ts --force          # rotate to a new key
 *   bun run scripts/create-admin-key.ts --seed wk_XYZ    # use a specific seed
 *   bun run scripts/create-admin-key.ts --name ops --scopes "live-chat,blog-pipeline"
 *
 * Security: the plaintext key is printed ONCE to stdout. Capture it now or
 * lose it forever. The DB only stores the hash.
 *
 * @author Keridz ⚙️ (be-coder)
 */

import { eq } from 'drizzle-orm'
import { db } from '../src/db'
import { hashingService } from '../src/services/hashing'
import { webhookApiKeyAudit, webhookApiKeys } from '../src/db/schema'
import { randomBytes } from 'node:crypto'

// ─── Argument parsing ─────────────────────────────────────────────

function parseArgs() {
	const args = process.argv.slice(2)
	const out: Record<string, string | boolean> = {}
	for (let i = 0; i < args.length; i++) {
		const a = args[i]
		if (a === '--force') out.force = true
		else if (a === '--help' || a === '-h') out.help = true
		else if (a.startsWith('--')) {
			out[a.slice(2)] = args[i + 1]
			i++
		}
	}
	return out as { force?: boolean; help?: boolean; name?: string; scopes?: string; seed?: string }
}

// ─── Default seed (the existing v1 key) ────────────────────────────

/**
 * Per the spec (Card 0e2f9fec §12 decision 5): the existing
 * `wk_kvlGrfkWJIinquVRyeCgrXsOTxBpEctVQNWwwAAYVxM` is the initial seed value
 * for the new row. After this seed is in place, future keys are generated
 * via the admin UI. To rotate off the seed, pass `--force`.
 */
const DEFAULT_SEED = 'wk_kvlGrfkWJIinquVRyeCgrXsOTxBpEctVQNWwwAAYVxM'
const DEFAULT_NAME = 'bootstrap'
const DEFAULT_SCOPES = 'live-chat,webhook-request,blog-pipeline'

// ─── ID generation (matches the route handler) ────────────────────

function newKeyId(): string {
	const t = Date.now().toString(36).toUpperCase().padStart(10, '0')
	const r = randomBytes(12)
		.toString('base64url')
		.replace(/[^A-Za-z0-9]/g, '')
		.toUpperCase()
		.padEnd(16, 'X')
		.slice(0, 16)
	return `wk_${t}${r}`
}

// ─── Main ──────────────────────────────────────────────────────────

async function main() {
	const args = parseArgs()

	if (args.help) {
		console.log(`bootstrap-create-admin-key.ts

Usage:
  bun run scripts/create-admin-key.ts                  # seed with existing v1 key (idempotent)
  bun run scripts/create-admin-key.ts --force          # rotate to a new key
  bun run scripts/create-admin-key.ts --name ops       # custom name (default: bootstrap)
  bun run scripts/create-admin-key.ts --scopes "live-chat,blog-pipeline"  # custom scopes
  bun run scripts/create-admin-key.ts --seed wk_XYZ    # custom seed (only used on first create)

Prints the plaintext key to stdout ONCE. The DB only stores the sha256 hash.`)
		process.exit(0)
	}

	const name = args.name || DEFAULT_NAME
	const scopes = args.scopes || DEFAULT_SCOPES
	const force = !!args.force

	// 1. Idempotency check: do we already have a key with this name?
	const existing = await db.query.webhookApiKeys.findFirst({
		where: eq(webhookApiKeys.name, name),
	})

	if (existing && !force) {
		console.error(`A key named "${name}" already exists (id=${existing.id}, prefix=${existing.keyPrefix}, revoked=${existing.revokedAt ? 'yes' : 'no'}).`)
		console.error('Pass --force to rotate. The plaintext key is NOT recoverable from the DB.')
		console.error('To issue a NEW key, use the admin UI or rotate via:')
		console.error('  POST /v1/admin/api-keys/<id>/rotate  (Bearer ADMIN_UI_API_KEY)')
		process.exit(1)
	}

	// 2. Build the key
	const plaintext = force ? hashingService.generateApiKey() : (args.seed || DEFAULT_SEED)
	const prefix = plaintext.slice(0, 8)
	const hash = hashingService.hashApiKey(plaintext)
	const id = newKeyId()

	// 3. If --force and an existing key with this name, revoke it first
	if (existing && force) {
		await db
			.update(webhookApiKeys)
			.set({ revokedAt: new Date(), revokedBy: 'cli-bootstrap', expiresAt: new Date() })
			.where(eq(webhookApiKeys.id, existing.id))
		await db.insert(webhookApiKeyAudit).values({
			keyId: existing.id,
			action: 'revoke',
			actor: 'cli-bootstrap',
			at: new Date(),
			meta: JSON.stringify({ reason: 'force-rotate', newKeyId: id }),
		})
	}

	// 4. Insert
	try {
		await db.insert(webhookApiKeys).values({
			id,
			keyPrefix: prefix,
			apiKeyHash: hash,
			name,
			scopes,
			createdAt: new Date(),
			createdBy: 'cli-bootstrap',
			notes: force ? 'force-rotated via create-admin-key.ts' : 'initial bootstrap seed',
		})
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e)
		if (msg.includes('UNIQUE')) {
			console.error('Hash collision — that key already exists in the DB. Use a different seed or --force.')
			process.exit(1)
		}
		throw e
	}

	// 5. Audit
	await db.insert(webhookApiKeyAudit).values({
		keyId: id,
		action: 'create',
		actor: 'cli-bootstrap',
		at: new Date(),
		meta: JSON.stringify({
			name,
			scopes,
			source: force ? 'force-rotate' : 'initial-bootstrap',
			keyHashPrefix: hash.slice(0, 12),
		}),
	})

	// 6. Print (ONCE)
	const sha256 = hash
	console.log('─'.repeat(72))
	console.log('✅ Webhook API key created.')
	console.log('')
	console.log(`  id:     ${id}`)
	console.log(`  name:   ${name}`)
	console.log(`  scopes: ${scopes}`)
	console.log(`  prefix: ${prefix}`)
	console.log(`  sha256: ${sha256}`)
	console.log('')
	console.log('  KEY (PLAINTEXT — COPY NOW, NEVER SHOWN AGAIN):')
	console.log('')
	console.log(`  ${plaintext}`)
	console.log('')
	console.log('─'.repeat(72))
	console.log('Next steps:')
	console.log('  1. Store the plaintext key in 1Password / password manager.')
	console.log('  2. Set it as WEBHOOK_API_KEY in the openclaw-webhook env (transitional fallback).')
	console.log('  3. Set it as WEBHOOK_API_KEY in Vercel for outbound andler-landing requests.')
	console.log('  4. Test with:')
	console.log(`     curl -H "X-Webhook-Key: ${plaintext}" http://127.0.0.1:18765/webhook/live-chat -d '{}'`)
	console.log('─'.repeat(72))
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error('create-admin-key failed:', e)
		process.exit(1)
	})

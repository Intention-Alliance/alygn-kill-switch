/**
 * openclaw-webhook — rotate-keys.ts
 *
 * Bun script for JWT key rotation. Generates a new keypair,
 * adds the new public key, archives the old private key.
 * Idempotent — safe to run multiple times.
 *
 * Usage:
 *   bun run scripts/rotate-keys.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { generateKeyPairSync, exportSPKI, exportPKCS8 } from 'node:crypto'

// ── Config ──────────────────────────────────────────────────────────────────

const PRIVATE_KEY_PATH = process.env.OPENCLAW_WEBHOOK_PRIVATE_KEY_PATH ?? ''
const TRUSTED_KEYS_DIR = process.env.OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR ?? ''

// ── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  if (!PRIVATE_KEY_PATH) {
    console.error('Error: OPENCLAW_WEBHOOK_PRIVATE_KEY_PATH not set')
    process.exit(1)
  }

  if (!TRUSTED_KEYS_DIR) {
    console.error('Error: OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR not set')
    process.exit(1)
  }

  // Ensure dirs exist
  const privateDir = dirname(PRIVATE_KEY_PATH)
  if (!existsSync(privateDir)) {
    mkdirSync(privateDir, { recursive: true })
  }
  if (!existsSync(TRUSTED_KEYS_DIR)) {
    mkdirSync(TRUSTED_KEYS_DIR, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

  // Archive old private key if it exists
  if (existsSync(PRIVATE_KEY_PATH)) {
    const archivedPath = `${PRIVATE_KEY_PATH}.archived-${timestamp}`
    renameSync(PRIVATE_KEY_PATH, archivedPath)
    console.log(`Archived old private key: ${archivedPath}`)
  }

  // Generate new EdDSA keypair
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')

  const privatePem = exportPKCS8(privateKey)
  const publicPem = exportSPKI(publicKey)

  // Write new private key
  writeFileSync(PRIVATE_KEY_PATH, privatePem, 'utf8')
  console.log(`New private key written: ${PRIVATE_KEY_PATH}`)

  // Write public key to trusted keys dir
  const publicKeyName = 'openclaw.pem'
  const publicKeyPath = join(TRUSTED_KEYS_DIR, publicKeyName)
  writeFileSync(publicKeyPath, publicPem, 'utf8')
  console.log(`New public key written: ${publicKeyPath}`)

  // Print distribution instructions
  console.log('\n📋 Key rotation complete. Next steps:')
  console.log('  1. Distribute the new public key to all callers:')
  console.log(`     cp ${publicKeyPath} <caller-env>/openclaw-webhook-public.pem`)
  console.log('  2. Update Vercel env var BLOG_PIPELINE_OPENCLAW_PUBLIC_KEY_PATH with the new key')
  console.log('  3. Restart the webhook server to load the new private key:')
  console.log('     kill -TERM <pid> && bun run ~/.openclaw/workspace/skills/openclaw-webhook/scripts/server.ts')
  console.log('  4. Remove old public keys from trusted dir only after all callers have updated')
  console.log('\n⚠️  Do NOT delete the archived private key — keep it for emergency rollback.')
}

main()
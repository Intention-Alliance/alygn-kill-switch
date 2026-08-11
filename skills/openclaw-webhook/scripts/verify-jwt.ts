/**
 * openclaw-webhook — verify-jwt.ts
 *
 * Bun script to verify a JWT against the trusted-keys directory.
 * Used by both server.ts and external tools for manual verification.
 *
 * Usage:
 *   bun run scripts/verify-jwt.ts --jwt <token> [--body <body-string>]
 *   bun run scripts/verify-jwt.ts --jwt-file <path> [--body-file <path>]
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { jwtVerify, importSPKI } from 'jose'

// ── Types ──────────────────────────────────────────────────────────────────

interface JwtClaims {
  iss: string
  aud: string
  sub: string
  event_type: string
  iat: number
  exp: number
  jti: string
  payload_sha256: string
}

// ── Config ──────────────────────────────────────────────────────────────────

const TRUSTED_KEYS_DIR = process.env.OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR ?? ''

// ── CLI arg parsing ────────────────────────────────────────────────────────

function parseArgs(): { jwt: string; body: string } {
  const args = process.argv.slice(2)
  let jwt = ''
  let body = ''

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--jwt' && args[i + 1]) {
      jwt = args[++i]
    } else if (args[i] === '--jwt-file' && args[i + 1]) {
      jwt = readFileSync(args[++i], 'utf8').trim()
    } else if (args[i] === '--body' && args[i + 1]) {
      body = args[++i]
    } else if (args[i] === '--body-file' && args[i + 1]) {
      body = readFileSync(args[++i], 'utf8')
    }
  }

  if (!jwt) {
    console.error('Usage: bun run scripts/verify-jwt.ts --jwt <token> [--body <body-string>]')
    console.error('       bun run scripts/verify-jwt.ts --jwt-file <path> [--body-file <path>]')
    process.exit(1)
  }

  return { jwt, body }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { jwt, body } = parseArgs()

  // Decode without verification to get the issuer
  const parts = jwt.split('.')
  if (parts.length !== 3) {
    console.error('Error: Invalid JWT format (expected 3 parts)')
    process.exit(1)
  }

  const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8')
  const claims = JSON.parse(payloadJson) as JwtClaims

  if (!claims.iss) {
    console.error('Error: JWT missing iss claim')
    process.exit(1)
  }

  console.log('JWT claims (pre-verification):')
  console.log(JSON.stringify(claims, null, 2))

  if (!TRUSTED_KEYS_DIR) {
    console.error('Error: OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR not set')
    process.exit(1)
  }

  const keyPath = join(TRUSTED_KEYS_DIR, `${claims.iss}.pem`)
  if (!existsSync(keyPath)) {
    console.error(`Error: No trusted public key for issuer: ${claims.iss} (expected at ${keyPath})`)
    process.exit(1)
  }

  const pem = readFileSync(keyPath, 'utf8')
  const publicKey = await importSPKI(pem, 'EdDSA')

  try {
    const { payload } = await jwtVerify(jwt, publicKey, {
      audience: 'openclaw-webhook',
      maxTokenAge: '300s',
    })

    const verifiedClaims = payload as unknown as JwtClaims
    console.log('\n✅ JWT verification successful')
    console.log(`  iss: ${verifiedClaims.iss}`)
    console.log(`  sub: ${verifiedClaims.sub}`)
    console.log(`  event_type: ${verifiedClaims.event_type}`)
    console.log(`  jti: ${verifiedClaims.jti}`)

    // Verify payload hash if body provided
    if (body) {
      const bodyHash = createHash('sha256').update(body).digest('hex')
      if (verifiedClaims.payload_sha256 === bodyHash) {
        console.log(`  payload_sha256: ✅ matches body`)
      } else {
        console.error(`  payload_sha256: ❌ mismatch!`)
        console.error(`    expected: ${verifiedClaims.payload_sha256}`)
        console.error(`    actual:   ${bodyHash}`)
        process.exit(1)
      }
    }

    process.exit(0)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`\n❌ JWT verification failed: ${message}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
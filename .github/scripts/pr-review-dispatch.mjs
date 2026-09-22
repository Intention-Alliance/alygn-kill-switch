#!/usr/bin/env node
/**
 * pr-review-dispatch.mjs — kill-switch edition
 * ── Two deliberate differences from the landing copy ──────────────────────
 *
 * 1. ISSUER. This repo uses its OWN keypair (`github-actions-kill-switch`),
 * 2. SIGNING API. Ed25519 has no digest, so `createSign('ed25519')` throws
 *    ERR_CRYPTO_INVALID_DIGEST. The correct call is `sign(null, data, key)`.
 *    The landing copy still uses `createSign('ed25519')`; that path has never
 *    run there because its dispatch job is gated behind a lint job that fails.
 *    This copy uses the API that actually works.
 */
import { createPrivateKey, sign, createHash, randomUUID } from 'node:crypto'

const WEBHOOK_URL = process.env.WEBHOOK_URL
const ISSUER = process.env.WEBHOOK_ISSUER
const AUDIENCE = 'openclaw-webhook'
const EVENT_TYPE = 'pr-review.request'
const TTL_SECONDS = 300

const b64url = (buf) => Buffer.from(buf).toString('base64url')

function signJwt(privateKeyPem, claims) {
  const key = createPrivateKey(privateKeyPem)
  const header = { alg: 'EdDSA', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: claims.sub,
    event_type: EVENT_TYPE,
    iat: now,
    exp: now + TTL_SECONDS,
    jti: randomUUID(),
    payload_sha256: claims.payloadSha256,
  }
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  // Ed25519 is a pure signature scheme — pass null as the digest algorithm.
  const signature = sign(null, Buffer.from(signingInput), key)
  return `${signingInput}.${b64url(signature)}`
}

async function main() {
  const privateKey = process.env.GH_ACTIONS_PRIVATE_KEY
  const xKey = process.env.WEBHOOK_X_KEY
  if (!privateKey) throw new Error('GH_ACTIONS_PRIVATE_KEY is not set')
  if (!xKey) throw new Error('WEBHOOK_X_KEY is not set')

  const body = {
    repo: process.env.GITHUB_REPOSITORY,
    prNumber: Number(process.env.PR_NUMBER),
    headSha: process.env.PR_HEAD_SHA,
    title: process.env.PR_TITLE,
    baseRef: process.env.PR_BASE_REF,
    headRef: process.env.PR_HEAD_REF,
    changedFiles: Number(process.env.PR_CHANGED_FILES ?? 0),
    diffUrl: process.env.PR_DIFF_URL,
    includeCoderabbit: true,
  }
  const bodyStr = JSON.stringify(body)
  const payloadSha256 = createHash('sha256').update(bodyStr).digest('hex')
  const token = signJwt(privateKey, { sub: `pr-${body.prNumber}`, payloadSha256 })

  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Key': xKey,
      Authorization: `Bearer ${token}`,
    },
    body: bodyStr,
  })

  const text = await res.text()
  console.log(`[pr-review-dispatch] ${res.status} ${text.slice(0, 300)}`)
  if (!res.ok) process.exit(1)
}

main().catch((err) => {
  console.error(`[pr-review-dispatch] failed: ${err.message}`)
  process.exit(1)
})

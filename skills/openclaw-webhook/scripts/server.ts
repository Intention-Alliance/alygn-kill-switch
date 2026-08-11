/**
 * openclaw-webhook — server.ts
 *
 * Bun + TypeScript HTTP server for the event-routing fabric.
 * Binds to 127.0.0.1 only (MEMORY lesson 27).
 * JWT-asymmetric auth via jose library.
 * Routes by event_type to registered handlers.
 *
 * Usage:
 *   bun run scripts/server.ts           # Start server
 *   bun run scripts/server.ts --dry-run  # Verify config + exit
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { SignJWT, jwtVerify, importSPKI, importPKCS8 } from 'jose'

// ── Types ──────────────────────────────────────────────────────────────────

interface EventHandler {
  eventType: string
  handler: (payload: unknown, manifest: EventManifest) => Promise<HandlerResult>
}

interface HandlerResult {
  status: 'processing' | 'ready' | 'failed' | 'partial'
  assets?: AssetEntry[]
  error?: { code: string; message: string; failed_assets?: Array<{ type: string; reason: string }> }
}

interface AssetEntry {
  type: string
  path: string
  base64: string
  sha256: string
  mime: string
  size_bytes: number
}

interface EventManifest {
  event_id: string
  event_type: string
  requester: string
  payload_sha256: string
  payload: unknown // Full request payload — canonical request record
  created_at: string
  expires_at: string
  status: 'pending' | 'processing' | 'ready' | 'failed' | 'partial'
  handler: string
  assets?: AssetEntry[]
  error?: { code: string; message: string; failed_assets?: Array<{ type: string; reason: string }> }
  updated_at: string
}

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

const PORT = Number(process.env.OPENCLAW_WEBHOOK_PORT ?? 18765)
const HOST = '127.0.0.1' // MEMORY lesson 27: bind to localhost only
const PRIVATE_KEY_PATH = process.env.OPENCLAW_WEBHOOK_PRIVATE_KEY_PATH ?? ''
const TRUSTED_KEYS_DIR = process.env.OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR ?? ''
const LOG_LEVEL = process.env.OPENCLAW_LOG_LEVEL ?? 'info'
const MANIFEST_DIR = process.env.OPENCLAW_MANIFEST_DIR ?? join(process.env.HOME ?? '/home/andlersrv', '.openclaw/workspace/.staging/webhook-manifests/')
const JWT_EXPIRY_SECONDS = Number(process.env.OPENCLAW_JWT_EXPIRY_SECONDS ?? 300)
const RATE_LIMIT_MAX = Number(process.env.OPENCLAW_RATE_LIMIT_MAX ?? 10)
const RATE_LIMIT_WINDOW_MS = Number(process.env.OPENCLAW_RATE_LIMIT_WINDOW_MS ?? 60_000)

// ── DB-backed API key auth (Card 0e2f9fec) ────────────────────────
//
// The kill-switch-api exposes a read-only HTTP lookup endpoint that
// returns the sha256 hash + scopes for a key prefix. We use it for M2M
// auth instead of the env-var string compare (which had three sources of
// truth and was producing 401s — see spec §1).
//
// KILL_SWITCH_API_URL — base URL of the kill-switch-api (default: http://127.0.0.1:3000)
// KILL_SWITCH_INTERNAL_KEY — shared secret for the internal endpoint
const KILL_SWITCH_API_URL = process.env.KILL_SWITCH_API_URL ?? 'http://127.0.0.1:3000'
const KILL_SWITCH_INTERNAL_KEY = process.env.KILL_SWITCH_INTERNAL_KEY ?? ''

type DbAuthResult =
  | { ok: true; keyPrefix: string; scopes?: string[] }
  | {
      ok: false
      error:
        | 'missing-internal-key'
        | 'malformed-key'
        | 'kill-switch-unreachable'
        | 'lookup-failed'
        | 'unauthorized' // kill-switch returned 401 (bad internal key)
        | 'not-found' // no row for that prefix
        | 'hash-mismatch' // sha256 didn't match
        | 'revoked' // revoked_at is set
        | 'expired' // expires_at passed
        | 'scope-mismatch' // requiredScope not in scopes
    }

/**
 * Verify an X-Webhook-Key against the kill-switch-api's internal lookup.
 *
 * Two-step verification (acceptance #5/6/7):
 *  1. HTTP GET ?prefix=<first 8 chars> — O(1) index lookup, returns the row
 *  2. sha256 the request key, compare to the returned hash in constant time
 *
 * If the lookup fails because the kill-switch-api is down (network error,
 * ECONNREFUSED, 5xx), we return 'kill-switch-unreachable' so the caller
 * can fall back to the env-var compare (acceptance #10 — 30-day safety net).
 *
 * @param apiKey  Plaintext key from X-Webhook-Key header
 * @param requiredScope  Scope to check (e.g. 'live-chat')
 * @returns Verification result with `ok: true` + keyPrefix on success, or `ok: false` + reason
 */
async function verifyApiKeyViaDbLookup(apiKey: string, requiredScope: string): Promise<DbAuthResult> {
  if (!KILL_SWITCH_INTERNAL_KEY) {
    // No internal key configured — skip DB lookup. The caller will fall
    // through to env-var (if set) or JWT.
    return { ok: false, error: 'missing-internal-key' }
  }
  if (!apiKey || apiKey.length < 16) {
    return { ok: false, error: 'malformed-key' }
  }
  const prefix = apiKey.slice(0, 8)

  let response: Response
  try {
    const url = `${KILL_SWITCH_API_URL}/v1/internal/api-keys/lookup?prefix=${encodeURIComponent(prefix)}`
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Internal-Key': KILL_SWITCH_INTERNAL_KEY,
        Accept: 'application/json',
      },
      // Tight timeout — the kill-switch-api is on localhost, anything >2s is wrong.
      signal: AbortSignal.timeout(2000),
    })
  } catch (e) {
    // Network error / timeout / kill-switch down. Caller will try env-var.
    return { ok: false, error: 'kill-switch-unreachable' }
  }

  if (response.status === 401) {
    return { ok: false, error: 'unauthorized' }
  }
  if (response.status === 404) {
    // No row for that prefix — the key is definitely not valid.
    return { ok: false, error: 'not-found' }
  }
  if (!response.ok) {
    return { ok: false, error: 'lookup-failed' }
  }

  let body: { id?: string; apiKeyHash?: string; scopes?: string[]; revokedAt?: string; expiresAt?: string }
  try {
    body = await response.json()
  } catch {
    return { ok: false, error: 'lookup-failed' }
  }

  if (!body.apiKeyHash) {
    return { ok: false, error: 'lookup-failed' }
  }
  if (body.revokedAt) {
    return { ok: false, error: 'revoked' }
  }
  if (body.expiresAt && new Date(body.expiresAt) < new Date()) {
    return { ok: false, error: 'expired' }
  }

  // Constant-time hash compare (defence-in-depth; the lookup already proved
  // the prefix is unique, but a hash compare is the textbook pattern).
  const expected = Buffer.from(body.apiKeyHash, 'hex')
  const actual = createHash('sha256').update(apiKey, 'utf8').digest()
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, error: 'hash-mismatch' }
  }

  if (requiredScope && !(body.scopes || []).includes(requiredScope)) {
    return { ok: false, error: 'scope-mismatch' }
  }

  return { ok: true, keyPrefix: prefix, scopes: body.scopes }
}

// ── Logger ──────────────────────────────────────────────────────────────────

function log(level: string, message: string, meta?: Record<string, unknown>): void {
  const levels = ['debug', 'info', 'warn', 'error']
  if (levels.indexOf(level) < levels.indexOf(LOG_LEVEL)) return
  const timestamp = new Date().toISOString()
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : ''
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`)
}

// ── Rate Limiter (token bucket: 10 req/min per IP) ─────────────────────────

const rateLimitMap = new Map<string, { tokens: number; lastRefill: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry) {
    rateLimitMap.set(ip, { tokens: RATE_LIMIT_MAX - 1, lastRefill: now })
    return true
  }

  const elapsed = now - entry.lastRefill
  const refilled = Math.min(
    RATE_LIMIT_MAX,
    entry.tokens + Math.floor(elapsed / (RATE_LIMIT_WINDOW_MS / RATE_LIMIT_MAX)),
  )

  if (refilled <= 0) return false

  rateLimitMap.set(ip, { tokens: refilled - 1, lastRefill: now })
  return true
}

// ── JWT Key Management ─────────────────────────────────────────────────────

const privateKeyCache = new Map<string, CryptoKey>()
const publicKeyCache = new Map<string, CryptoKey>()

async function loadPrivateKey(): Promise<CryptoKey> {
  if (privateKeyCache.has('server')) return privateKeyCache.get('server')!

  if (!PRIVATE_KEY_PATH || !existsSync(PRIVATE_KEY_PATH)) {
    throw new Error(`OPENCLAW_WEBHOOK_PRIVATE_KEY_PATH not set or file does not exist: ${PRIVATE_KEY_PATH}`)
  }

  const pem = readFileSync(PRIVATE_KEY_PATH, 'utf8')
  const key = await importPKCS8(pem, 'EdDSA')
  privateKeyCache.set('server', key)
  return key
}

async function loadPublicKey(issuer: string): Promise<CryptoKey> {
  if (publicKeyCache.has(issuer)) return publicKeyCache.get(issuer)!

  if (!TRUSTED_KEYS_DIR) {
    throw new Error('OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR not set')
  }

  const keyPath = join(TRUSTED_KEYS_DIR, `${issuer}.pem`)
  if (!existsSync(keyPath)) {
    throw new Error(`No trusted public key for issuer: ${issuer} (expected at ${keyPath})`)
  }

  const pem = readFileSync(keyPath, 'utf8')
  const key = await importSPKI(pem, 'EdDSA')
  publicKeyCache.set(issuer, key)
  return key
}

// ── JWT Verification ───────────────────────────────────────────────────────

const seenJti = new Set<string>()

async function verifyJwt(token: string, body: string): Promise<JwtClaims> {
  // Decode without verification to get the issuer
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid JWT format')

  const headerJson = Buffer.from(parts[0], 'base64url').toString('utf8')
  const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8')
  const claims = JSON.parse(payloadJson) as JwtClaims

  if (!claims.iss) throw new Error('JWT missing iss claim')
  if (claims.aud !== 'openclaw-webhook') throw new Error('JWT aud must be "openclaw-webhook"')

  // Load the issuer's public key and verify
  const publicKey = await loadPublicKey(claims.iss)
  const { payload } = await jwtVerify(token, publicKey, {
    audience: 'openclaw-webhook',
    maxTokenAge: `${JWT_EXPIRY_SECONDS}s`,
  })

  const verifiedClaims = payload as unknown as JwtClaims

  // Replay protection
  if (seenJti.has(verifiedClaims.jti)) {
    throw new Error(`Replay detected: jti ${verifiedClaims.jti} already seen`)
  }
  seenJti.add(verifiedClaims.jti)

  // Clean old jti entries (keep last 1000)
  if (seenJti.size > 1000) {
    const toDelete = Array.from(seenJti).slice(0, seenJti.size - 1000)
    for (const jti of toDelete) seenJti.delete(jti)
  }

  // Verify payload hash — skip for GET requests (empty body, nothing to hash)
  const bodyHash = createHash('sha256').update(body).digest('hex')
  if (body !== '' && verifiedClaims.payload_sha256 !== bodyHash) {
    throw new Error('payload_sha256 mismatch — body may have been tampered with')
  }

  return verifiedClaims
}

// ── Response Signing ───────────────────────────────────────────────────────

async function signResponse(payload: Record<string, unknown>): Promise<string> {
  const key = await loadPrivateKey()
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${JWT_EXPIRY_SECONDS}s`)
    .setIssuer('openclaw-webhook')
    .setAudience('vercel')
    .sign(key)
}

// ── Manifest Management ────────────────────────────────────────────────────

function ensureManifestDir(): void {
  if (!existsSync(MANIFEST_DIR)) {
    mkdirSync(MANIFEST_DIR, { recursive: true })
  }
}

function getManifestPath(eventId: string): string {
  return join(MANIFEST_DIR, `${eventId}.json`)
}

function readManifest(eventId: string): EventManifest | null {
  const manifestPath = getManifestPath(eventId)
  if (!existsSync(manifestPath)) return null
  const data = readFileSync(manifestPath, 'utf8')
  return JSON.parse(data) as EventManifest
}

function writeManifest(manifest: EventManifest): void {
  ensureManifestDir()
  const manifestPath = getManifestPath(manifest.event_id)
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
}

function createManifest(claims: JwtClaims, payload: unknown): EventManifest {
  const now = new Date().toISOString()
  // Store the full payload in the manifest — canonical request record.
  // Future iterations may move payloads to a separate store if they exceed 1MB.
  return {
    event_id: claims.sub,
    event_type: claims.event_type,
    requester: claims.iss,
    payload_sha256: claims.payload_sha256,
    payload,
    created_at: now,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: 'pending',
    handler: claims.event_type,
    updated_at: now,
  }
}

// ── Handler Registry ───────────────────────────────────────────────────────

const handlerRegistry = new Map<string, EventHandler>()

export function registerHandler(eventType: string, handler: (payload: unknown, manifest: EventManifest) => Promise<HandlerResult>): void {
  handlerRegistry.set(eventType, { eventType, handler })
  log('info', `Handler registered: ${eventType}`)
}

function getHandler(eventType: string): EventHandler | null {
  return handlerRegistry.get(eventType) ?? null
}

// ── HTTP Server ────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  async fetch(request) {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method

    // ── Health check (no auth) ──────────────────────────────────────────
    if (path === '/webhook/health' && method === 'GET') {
      return Response.json({
        status: 'ok',
        uptime_seconds: process.uptime(),
        handlers: Array.from(handlerRegistry.keys()),
      })
    }

    // ── Rate limit ─────────────────────────────────────────────────────
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown'
    if (!checkRateLimit(ip)) {
      return Response.json(
        { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' } },
        { status: 429 },
      )
    }

    // ── POST /webhook/request ───────────────────────────────────────────
    if (path === '/webhook/request' && method === 'POST') {
      try {
        const authHeader = request.headers.get('authorization')
        if (!authHeader?.startsWith('Bearer ')) {
          return Response.json(
            { error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' } },
            { status: 401 },
          )
        }

        const token = authHeader.slice(7)
        const body = await request.text()

        let claims: JwtClaims
        try {
          claims = await verifyJwt(token, body)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          log('warn', `JWT verification failed: ${message}`)
          return Response.json(
            { error: { code: 'INVALID_JWT', message } },
            { status: 400 },
          )
        }

        // Route to handler
        const handler = getHandler(claims.event_type)
        if (!handler) {
          return Response.json(
            { error: { code: 'NO_HANDLER', message: `No handler registered for event_type: ${claims.event_type}` } },
            { status: 404 },
          )
        }

        // Parse body
        const payload = JSON.parse(body) as unknown

        // Create manifest
        const manifest = createManifest(claims, payload)
        writeManifest(manifest)

        // Call handler (async — the handler updates the manifest when done)
        handler.handler(payload, manifest).then((result) => {
          const updatedManifest: EventManifest = {
            ...manifest,
            status: result.status,
            assets: result.assets,
            error: result.error,
            updated_at: new Date().toISOString(),
          }
          writeManifest(updatedManifest)
          log('info', `Handler completed: ${claims.event_type} for ${claims.sub} → ${result.status}`)
        }).catch((err) => {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error'
          log('error', `Handler failed: ${claims.event_type} for ${claims.sub}: ${errorMessage}`)
          const updatedManifest: EventManifest = {
            ...manifest,
            status: 'failed',
            error: { code: 'HANDLER_ERROR', message: errorMessage },
            updated_at: new Date().toISOString(),
          }
          writeManifest(updatedManifest)
        })

        // Sign the response
        const responsePayload = {
          event_id: claims.sub,
          event_type: claims.event_type,
          status: 'pending',
          accepted: true,
          manifest_path: getManifestPath(claims.sub),
        }
        const signed = await signResponse(responsePayload)

        return Response.json(
          { ...responsePayload, signed_response: signed },
          { status: 202 },
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error'
        log('error', `Request handler error: ${message}`)
        return Response.json(
          { error: { code: 'SERVER_ERROR', message } },
          { status: 500 },
        )
      }
    }

    // ── GET /webhook/status ─────────────────────────────────────────────
    if (path === '/webhook/status' && method === 'GET') {
      try {
        const authHeader = request.headers.get('authorization')
        if (!authHeader?.startsWith('Bearer ')) {
          return Response.json(
            { error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' } },
            { status: 401 },
          )
        }

        const token = authHeader.slice(7)
        const body = '' // GET has no body
        let claims: JwtClaims
        try {
          claims = await verifyJwt(token, body)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          return Response.json(
            { error: { code: 'INVALID_JWT', message } },
            { status: 400 },
          )
        }

        const eventType = url.searchParams.get('event_type')
        const eventId = url.searchParams.get('event_id')

        if (!eventType || !eventId) {
          return Response.json(
            { error: { code: 'BAD_REQUEST', message: 'Missing event_type or event_id query param' } },
            { status: 400 },
          )
        }

        const manifest = readManifest(eventId)
        if (!manifest) {
          return Response.json(
            { error: { code: 'NOT_FOUND', message: `No manifest found for event_id: ${eventId}` } },
            { status: 404 },
          )
        }

        const responsePayload = {
          event_id: manifest.event_id,
          event_type: manifest.event_type,
          status: manifest.status,
          assets: manifest.assets ?? [],
          updated_at: manifest.updated_at,
          request_created_at: manifest.created_at,
          error: manifest.error ?? null,
        }
        const signed = await signResponse(responsePayload)

        return Response.json(
          { ...responsePayload, signed_response: signed },
          { status: 200 },
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error'
        log('error', `Status handler error: ${message}`)
        return Response.json(
          { error: { code: 'SERVER_ERROR', message } },
          { status: 500 },
        )
      }
    }

    // ── POST /webhook/live-chat (OpenClaw direct inference path) ──────────────
    // Replaces the deprecated /webhook/forward (2026-07-23). Single-hop:
    // Vercel (or any JWT-authed caller) posts a chat message in standard
    // Ollama /api/chat format. The webhook verifies the JWT, calls Ollama
    // locally as part of the handler, and returns the Ollama JSON response.
    // The webhook is the ONLY public face on the Tailscale-served port;
    // Ollama stays on :11434 (localhost only), reachable from this process.
    if (path === '/webhook/live-chat' && method === 'POST') {
      try {
        const body = await request.text()

        // ── Auth: API key via DB lookup (preferred) or env-var fallback ──
        // Card 0e2f9fec / spec §6 / acceptance #5, #6, #7, #10.
        //
        // Order of checks:
        //  1. X-Webhook-Key header is present
        //  2. Try HTTP lookup against kill-switch-api's /v1/internal/api-keys/lookup
        //     (KILL_SWITCH_API_URL + X-Internal-Key) — primary path
        //  3. On lookup error (kill-switch down, network, 5xx), fall back to
        //     WEBHOOK_API_KEY env-var compare. This is the 30-day safety net.
        //  4. JWT as final fallback for callers that already have keypairs.
        const apiKey = request.headers.get('x-webhook-key')

        let authed = false
        if (apiKey) {
          // Try the DB-backed lookup first
          const dbAuthed = await verifyApiKeyViaDbLookup(apiKey, 'live-chat')
          if (dbAuthed.ok) {
            authed = true
            log('info', `live-chat auth: db-lookup key=${dbAuthed.keyPrefix} scopes=${dbAuthed.scopes?.join(',')}`)
          } else if (
            dbAuthed.error === 'kill-switch-unreachable' ||
            dbAuthed.error === 'lookup-failed' ||
            dbAuthed.error === 'missing-internal-key'
          ) {
            // Safety-net: try the env-var fallback (acceptance #10).
            // missing-internal-key: kill-switch-api not configured on this
            // host — the env-var compare is the ONLY auth path, so it must
            // run (diagnostic 581d69df, 2026-08-06).
            //
            // Accept both WEBHOOK_API_KEY (transport contract, ADR-017 §3.12)
            // and OPENCLAW_WEBHOOK_SECRET_CHAT (Phase 4 provisioned secret,
            // card 43046320) so the provisioned value is actually read.
            const expectedApiKey =
              process.env.WEBHOOK_API_KEY?.trim() ||
              process.env.OPENCLAW_WEBHOOK_SECRET_CHAT?.trim()
            if (expectedApiKey && apiKey.length === expectedApiKey.length) {
              const a = Buffer.from(apiKey, 'utf8')
              const b = Buffer.from(expectedApiKey, 'utf8')
              if (timingSafeEqual(a, b)) {
                authed = true
                log('warn', `live-chat auth: env-var fallback (kill-switch unreachable: ${dbAuthed.error})`)
              } else {
                log('warn', `live-chat auth: env-var fallback rejected (db lookup error=${dbAuthed.error})`)
              }
            } else if (expectedApiKey) {
              // Env-var is set but doesn't match — treat as 401, not env-var-ok.
              log('warn', `live-chat auth: env-var fallback rejected (db lookup error=${dbAuthed.error})`)
            }
          } else {
            // db lookup returned 401/404 (the key is bad, not the lookup).
            // Don't fall through to env-var — that's a different auth model.
            log('info', `live-chat auth: db-lookup rejected reason=${dbAuthed.error}`)
          }
        }

        if (!authed) {
          // Fall through to JWT auth
          const authHeader = request.headers.get('authorization')
          if (!authHeader?.startsWith('Bearer ')) {
            return Response.json(
              { error: { code: 'UNAUTHORIZED', message: 'Missing X-Webhook-Key or Authorization header' } },
              { status: 401 },
            )
          }

          const token = authHeader.slice(7)

          let claims: JwtClaims
          try {
            claims = await verifyJwt(token, body)
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            log('warn', `JWT verification failed on /webhook/live-chat: ${message}`)
            return Response.json(
              { error: { code: 'INVALID_JWT', message } },
              { status: 400 },
            )
          }

          if (claims.iss !== 'vercel' && claims.iss !== 'openclaw') {
            return Response.json(
              { error: { code: 'UNAUTHORIZED', message: `Issuer '${claims.iss}' not allowed for /webhook/live-chat` } },
              { status: 401 },
            )
          }
          log('info', `live-chat auth: jwt iss=${claims.iss}`)
        }

        // Call local Ollama (same box, no tailnet needed).
        const ollamaUrl = process.env.OLLAMA_LOCAL_URL ?? 'http://127.0.0.1:11434'
        const ollamaRes = await fetch(`${ollamaUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(55_000),
        })

        if (!ollamaRes.ok) {
          const errBody = await ollamaRes.text().catch(() => '')
          log('error', `Ollama /api/chat returned ${ollamaRes.status}: ${errBody.slice(0, 500)}`)
          return Response.json(
            { error: { code: 'OLLAMA_ERROR', message: `Ollama returned ${ollamaRes.status}`, body: errBody.slice(0, 1000) } },
            { status: 502 },
          )
        }

        const ollamaData = await ollamaRes.json()
        log('info', `live-chat inference: model=${ollamaData.model} tokens=${ollamaData.eval_count ?? 0}`)
        return Response.json(ollamaData)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        log('error', `/webhook/live-chat error: ${message}`)
        return Response.json(
          { error: { code: 'INTERNAL', message } },
          { status: 500 },
        )
      }
    }

    // DEPRECATED: /webhook/forward (2026-07-22 → 2026-07-23).
    // Replaced by /webhook/live-chat above. The Ollama-as-public-proxy
    // design assumed Vercel would call Ollama through the webhook; the
    // new design makes the webhook the inference point itself. No active
    // callers remain. Kept for rollback safety; remove after 7 days.
    if (path === '/webhook/forward' && method === 'POST') {
      return Response.json(
        { error: { code: 'DEPRECATED', message: '/webhook/forward was replaced by /webhook/live-chat on 2026-07-23' } },
        { status: 410 },
      )
    }

    // ── 404 ──────────────────────────────────────────────────────────────
    return Response.json(
      { error: { code: 'NOT_FOUND', message: `No route for ${method} ${path}` } },
      { status: 404 },
    )
  },
})

log('info', `openclaw-webhook server listening on ${HOST}:${PORT}`)
log('info', `Manifest dir: ${MANIFEST_DIR}`)
log('info', `Trusted keys dir: ${TRUSTED_KEYS_DIR || '(not set)'}`)

// ── Dry run mode ───────────────────────────────────────────────────────────

if (process.argv.includes('--dry-run')) {
  log('info', 'Dry run mode — verifying config and exiting')
  try {
    await loadPrivateKey()
    log('info', 'Private key loaded successfully')
    if (TRUSTED_KEYS_DIR && existsSync(TRUSTED_KEYS_DIR)) {
      const keys = readdirSync(TRUSTED_KEYS_DIR)
      log('info', `Trusted keys found: ${keys.join(', ')}`)
    } else {
      log('warn', 'Trusted keys dir not set or does not exist')
    }
    log('info', 'Dry run complete — config verified')
    server.stop()
    process.exit(0)
  } catch (err) {
    log('error', `Dry run failed: ${err instanceof Error ? err.message : String(err)}`)
    server.stop()
    process.exit(1)
  }
}
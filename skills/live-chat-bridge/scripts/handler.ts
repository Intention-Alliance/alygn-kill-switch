/**
 * live-chat-bridge — handler.ts
 *
 * Event handler for `live-chat.message` events routed by openclaw-webhook.
 * Validates payload, deduplicates by event_id (in-memory LRU, 1000 entries,
 * 24h TTL), rate-limits per IP (100/min), and routes to the lobster pipeline
 * (escalate) or synchronous slot lookup (list_slots).
 *
 * Exports: handleLiveChatMessage — registered by boot.ts via registerHandler().
 */

import { validatePayload, type LiveChatPayload } from './validate-payload.ts'

// ── Pipeline Runner Injection (DI per AGENTS.md) ─────────────────────────────

export type PipelineRunner = (payload: LiveChatPayload, manifest: EventManifest) => Promise<HandlerResult>

let pipelineRunner: PipelineRunner = (payload, manifest) => invokeLobsterPipeline(payload as Extract<LiveChatPayload, { action: 'escalate' }>, manifest)

export function setPipelineRunner(runner: PipelineRunner): void {
  pipelineRunner = runner
}

export function resetPipelineRunner(): void {
  pipelineRunner = (payload, manifest) => invokeLobsterPipeline(payload as Extract<LiveChatPayload, { action: 'escalate' }>, manifest)
}

// ── Types (matching openclaw-webhook server.ts) ──────────────────────────────

export interface EventManifest {
  event_id: string
  event_type: string
  requester: string
  payload_sha256: string
  payload: unknown
  created_at: string
  expires_at: string
  status: 'pending' | 'processing' | 'ready' | 'failed' | 'partial'
  handler: string
  assets?: AssetEntry[]
  error?: { code: string; message: string; failed_assets?: Array<{ type: string; reason: string }> }
  updated_at: string
}

interface AssetEntry {
  type: string
  path: string
  base64: string
  sha256: string
  mime: string
  size_bytes: number
}

interface HandlerResult {
  status: 'processing' | 'ready' | 'failed' | 'partial'
  assets?: AssetEntry[]
  error?: { code: string; message: string; failed_assets?: Array<{ type: string; reason: string }> }
}

// ── Dedup Cache (in-memory LRU, 1000 entries, 24h TTL) ─────────────────────

interface CacheEntry {
  event_id: string
  result: HandlerResult
  expires_at: number
}

const DEDUPE_CACHE_MAX = 1000
const DEDUPE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const dedupeCache = new Map<string, CacheEntry>()

function getCachedResult(eventId: string): HandlerResult | null {
  const entry = dedupeCache.get(eventId)
  if (!entry) return null
  if (Date.now() > entry.expires_at) {
    dedupeCache.delete(eventId)
    return null
  }
  return entry.result
}

function setCachedResult(eventId: string, result: HandlerResult): void {
  // Evict oldest entries when cache exceeds max size
  if (dedupeCache.size >= DEDUPE_CACHE_MAX) {
    const oldestKey = dedupeCache.keys().next().value
    if (oldestKey) dedupeCache.delete(oldestKey)
  }
  dedupeCache.set(eventId, {
    event_id: eventId,
    result,
    expires_at: Date.now() + DEDUPE_TTL_MS,
  })
}

// ── Rate Limiter (100 events/min/IP, in-memory token bucket) ────────────────

const RATE_LIMIT_MAX = 100
const RATE_LIMIT_WINDOW_MS = 60_000
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

// ── Lobster Invocation ──────────────────────────────────────────────────────

async function invokeLobsterPipeline(
  payload: Extract<LiveChatPayload, { action: 'escalate' }>,
  manifest: EventManifest,
): Promise<HandlerResult> {
  const pipelinePath = `${process.env.HOME}/.openclaw/workspace/.lobster/live-chat-bridge.lobster`
  const argsJson = JSON.stringify({
    input_json: JSON.stringify(payload),
    conversation_id: manifest.event_id,
  })

  try {
    const proc = Bun.spawn({
      cmd: ['bun', 'lobster', 'run', pipelinePath, '--args', argsJson],
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 30_000, // 30s timeout for pipeline invocation
    })

    const exitCode = await proc.exited

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      return {
        status: 'failed',
        error: {
          code: 'PIPELINE_ERROR',
          message: `Lobster pipeline exited ${exitCode}: ${stderr.slice(0, 500)}`,
        },
      }
    }

    return { status: 'processing' }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown pipeline error'
    if (message.includes('timeout') || message.includes('Timeout')) {
      return {
        status: 'failed',
        error: { code: 'TIMEOUT', message: 'Pipeline invocation exceeded 30s timeout' },
      }
    }
    return {
      status: 'failed',
      error: { code: 'PIPELINE_ERROR', message },
    }
  }
}

// ── Synchronous Slot Lookup ─────────────────────────────────────────────────

async function listCalendarSlots(
  payload: Extract<LiveChatPayload, { action: 'list_slots' }>,
  manifest: EventManifest,
): Promise<HandlerResult> {
  const scriptPath = `${process.env.HOME}/.repos/local/andler-landing/bin/prospect-intake-list-slots.mjs`
  const inputJson = JSON.stringify({
    lookahead_days: payload.lookahead_days,
    window_start_hour: 8,
    window_end_hour: 14,
    weekdays: ['mon', 'tue', 'wed', 'thu'],
    timezone: 'America/Costa_Rica',
    slot_count: payload.slot_count,
  })

  try {
    const proc = Bun.spawn({
      cmd: ['bun', scriptPath, '--input', inputJson],
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 15_000,
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      return {
        status: 'failed',
        error: {
          code: 'PIPELINE_ERROR',
          message: `list-slots.mjs exited ${exitCode}: ${stderr.slice(0, 500)}`,
        },
      }
    }

    const result = JSON.parse(stdout)
    const slotsJson = JSON.stringify(result.slots ?? [])
    const slotsBase64 = btoa(slotsJson)
    const slotsHash = await sha256Hex(slotsJson)

    return {
      status: 'ready',
      assets: [
        {
          type: 'calendar_slots',
          path: '',
          base64: slotsBase64,
          sha256: slotsHash,
          mime: 'application/json',
          size_bytes: slotsJson.length,
        },
      ],
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Slot lookup error'
    return {
      status: 'failed',
      error: { code: 'PIPELINE_ERROR', message },
    }
  }
}

// ── Helper: SHA-256 hex ──────────────────────────────────────────────────────

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ── Main Handler ─────────────────────────────────────────────────────────────

export async function handleLiveChatMessage(
  payload: unknown,
  manifest: EventManifest,
): Promise<HandlerResult> {
  // 1. Dedupe check — return cached result for duplicate event_ids
  const cached = getCachedResult(manifest.event_id)
  if (cached) {
    return cached
  }

  // 2. Rate limit check (uses requester IP from manifest as proxy)
  const requesterIp = manifest.requester ?? 'unknown'
  if (!checkRateLimit(requesterIp)) {
    return {
      status: 'failed',
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many live-chat.message events from this requester',
      },
    }
  }

  // 3. Validate payload against Zod schemas
  const validation = validatePayload(payload)
  if (!validation.success) {
    const result: HandlerResult = {
      status: 'failed',
      error: { code: 'INVALID_PAYLOAD', message: validation.error },
    }
    setCachedResult(manifest.event_id, result)
    return result
  }

  // 4. Route by action
  const data = validation.data
  let result: HandlerResult

  if (data.action === 'escalate') {
    result = await pipelineRunner(data, manifest)
  } else {
    result = await listCalendarSlots(data, manifest)
  }

  // 5. Cache the result for dedup
  setCachedResult(manifest.event_id, result)

  return result
}
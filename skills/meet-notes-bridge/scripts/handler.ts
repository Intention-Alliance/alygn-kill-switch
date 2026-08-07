/**
 * meet-notes-bridge — handler.ts
 *
 * Event handler for `meet-notes.request` events routed by openclaw-webhook.
 *
 * Scope (Phase 4 — card 43046320):
 *   This is a thin ROUTING stub. It accepts inbound meet-notes.request
 *   events, validates the JWT-derived context, and writes a manifest
 *   describing the request. Actual transcript-to-Notion / summary /
 *   action-item extraction belongs to a future meet-notes consumer
 *   skill (likely owned by ml agent once Google Meet MCP lands on a
 *   paired Chrome node — see andler-ops card `f50b8e1f` Phase 5).
 *
 * Auth model: JWT-asymmetric via openclaw-webhook server.ts. The
 * trusted public key for the meet-notes caller lives at
 * $OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR/meet-notes.pem.
 *
 * Wired by openclaw-webhook/scripts/boot.ts via boot.ts in this dir.
 */

import { appendFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
// registerHandler() lives in boot.ts (which is what
// openclaw-webhook/scripts/boot.ts dynamically imports). handler.ts
// only exports the handler function for boot.ts to wire up.
// We intentionally do NOT import or call registerHandler here, to
// avoid double-registration when both boot.ts and a direct handler.ts
// import are resolved through the same module graph.

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

interface MeetNotesPayload {
  meeting_id?: string
  transcript_url?: string
  started_at?: string
  ended_at?: string
  participants?: string[]
  source?: 'google-meet' | 'zoom' | 'other'
}

// ── Config ──────────────────────────────────────────────────────────────────

const LOG_PATH = process.env.MEET_NOTES_LOG_PATH ??
  join(process.env.HOME ?? '/home/andlersrv', '.openclaw/workspace/.staging/meet-notes/events.jsonl')

// ── Logger ──────────────────────────────────────────────────────────────────

function log(level: string, message: string, meta?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString()
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : ''
  console.log(`[${timestamp}] [meet-notes] [${level.toUpperCase()}] ${message}${metaStr}`)
}

function appendEventLog(record: Record<string, unknown>): void {
  try {
    const dir = join(LOG_PATH, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    appendFileSync(LOG_PATH, JSON.stringify(record) + '\n', 'utf8')
  } catch (err) {
    log('warn', `Failed to append event log: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function handleMeetNotesRequest(
  payload: unknown,
  manifest: EventManifest,
): Promise<HandlerResult> {
  const body = payload as MeetNotesPayload

  // Light validation — actual schema enforcement will move to a Zod
  // schema in the meet-notes consumer skill (Phase 5).
  if (!body || typeof body !== 'object') {
    return {
      status: 'failed',
      error: { code: 'INVALID_PAYLOAD', message: 'Payload must be a JSON object' },
    }
  }

  log('info', `meet-notes.request received`, {
    event_id: manifest.event_id,
    requester: manifest.requester,
    meeting_id: body.meeting_id,
    source: body.source,
  })

  // Persist a record so the consumer skill can pick it up later.
  appendEventLog({
    event_id: manifest.event_id,
    event_type: manifest.event_type,
    requester: manifest.requester,
    received_at: new Date().toISOString(),
    payload: body,
    status: 'pending',
  })

  // Stub: return 'processing' so the manifest reflects that we accepted
  // the event but a downstream consumer will finalize the result. The
  // consumer (Phase 5) will update the manifest in-place when it
  // produces notes.
  return { status: 'processing' }
}

// NOTE: registerHandler() is called from boot.ts, NOT here.
// (See the comment at the top of this file for rationale.)

/**
 * andler-blog-pipeline — processor.ts
 *
 * Bun script that polls OPENCLAW_MANIFEST_DIR for status: pending entries,
 * calls the handler, updates status.
 * Idempotent — skips already-generated assets.
 *
 * Usage:
 *   bun run scripts/processor.ts           # Process all pending
 *   bun run scripts/processor.ts --once     # Process one and exit
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// ── Types ──────────────────────────────────────────────────────────────────

interface EventManifest {
  event_id: string
  event_type: string
  requester: string
  payload_sha256: string
  created_at: string
  expires_at: string
  status: 'pending' | 'processing' | 'ready' | 'failed' | 'partial'
  handler: string
  assets?: unknown[]
  error?: { code: string; message: string; failed_assets?: Array<{ type: string; reason: string }> }
  updated_at: string
}

// ── Config ──────────────────────────────────────────────────────────────────

const MANIFEST_DIR = process.env.OPENCLAW_MANIFEST_DIR ??
  join(process.env.HOME ?? '/home/andlersrv', '.openclaw/workspace/.staging/webhook-manifests/')
const LOG_LEVEL = process.env.BLOG_PIPELINE_LOG_LEVEL ?? 'info'
const ONCE = process.argv.includes('--once')

// ── Logger ──────────────────────────────────────────────────────────────────

function log(level: string, message: string, meta?: Record<string, unknown>): void {
  const levels = ['debug', 'info', 'warn', 'error']
  if (levels.indexOf(level) < levels.indexOf(LOG_LEVEL)) return
  const timestamp = new Date().toISOString()
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : ''
  console.log(`[${timestamp}] [blog-pipeline/processor] [${level.toUpperCase()}] ${message}${metaStr}`)
}

// ── Manifest helpers ─────────────────────────────────────────────────────────

function readManifest(path: string): EventManifest | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as EventManifest
  } catch {
    log('warn', `Failed to parse manifest: ${path}`)
    return null
  }
}

function writeManifest(path: string, manifest: EventManifest): void {
  writeFileSync(path, JSON.stringify(manifest, null, 2), 'utf8')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!existsSync(MANIFEST_DIR)) {
    log('debug', 'Manifest dir does not exist, nothing to process')
    return
  }

  const files = readdirSync(MANIFEST_DIR).filter((f) => f.endsWith('.json'))
  let processed = 0

  for (const file of files) {
    const manifestPath = join(MANIFEST_DIR, file)
    const manifest = readManifest(manifestPath)
    if (!manifest) continue

    // Only process blog-pipeline manifests that are pending
    if (!manifest.event_type.startsWith('blog-pipeline')) continue
    if (manifest.status !== 'pending') continue

    log('info', `Processing manifest: ${manifest.event_id}`)

    // Update status to processing
    manifest.status = 'processing'
    manifest.updated_at = new Date().toISOString()
    writeManifest(manifestPath, manifest)

    try {
      // Dynamic import of handler
      const { handleBlogPipelineRequest } = await import('./handler.ts')

      // Reconstruct the payload from the manifest
      // In a real scenario, the payload would be stored alongside the manifest
      // For now, we process based on what's in the manifest
      const payload = {
        slug: manifest.event_id,
        title: manifest.event_id,
        category: 'Engineering',
        assets: [],
      }

      const result = await handleBlogPipelineRequest(payload, manifest)

      // Update manifest with results
      manifest.status = result.status
      manifest.assets = result.assets
      manifest.error = result.error
      manifest.updated_at = new Date().toISOString()
      writeManifest(manifestPath, manifest)

      processed++
      log('info', `Manifest ${manifest.event_id}: ${result.status}`)

      if (ONCE) break
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log('error', `Manifest ${manifest.event_id} failed: ${message}`)
      manifest.status = 'failed'
      manifest.error = { code: 'PROCESSOR_ERROR', message }
      manifest.updated_at = new Date().toISOString()
      writeManifest(manifestPath, manifest)
      processed++
      if (ONCE) break
    }
  }

  log('info', `Processor complete: ${processed} manifests processed`)
}

main().catch((err) => {
  log('error', `Fatal: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
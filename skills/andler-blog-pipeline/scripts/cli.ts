/**
 * andler-blog-pipeline — cli.ts
 *
 * CLI entry point for manual blog pipeline operations.
 *
 * Usage:
 *   bun run scripts/cli.ts --event-id=<id>    # Process a single manifest
 *   bun run scripts/cli.ts --all              # Process all pending manifests
 *   bun run scripts/cli.ts --help             # Show help
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

// ── Config ──────────────────────────────────────────────────────────────────

const MANIFEST_DIR = process.env.OPENCLAW_MANIFEST_DIR ??
  join(process.env.HOME ?? '/home/andlersrv', '.openclaw/workspace/.staging/webhook-manifests/')

// ── Types ──────────────────────────────────────────────────────────────────

interface EventManifest {
  event_id: string
  event_type: string
  status: 'pending' | 'processing' | 'ready' | 'failed' | 'partial'
  handler: string
  updated_at: string
}

// ── Help ─────────────────────────────────────────────────────────────────────

function showHelp(): void {
  console.log(`
andler-blog-pipeline CLI

Usage:
  bun run scripts/cli.ts --event-id=<id>    Process a single manifest by event ID
  bun run scripts/cli.ts --all              Process all pending manifests
  bun run scripts/cli.ts --list             List all manifests with their status
  bun run scripts/cli.ts --help             Show this help message

Environment:
  OPENCLAW_MANIFEST_DIR    Directory for event manifests
  BLOG_PIPELINE_LOG_LEVEL  Log level (debug, info, warn, error)
`)
}

// ── List ─────────────────────────────────────────────────────────────────────

function listManifests(): void {
  if (!existsSync(MANIFEST_DIR)) {
    console.log('No manifests directory found.')
    return
  }

  const files = readdirSync(MANIFEST_DIR).filter((f) => f.endsWith('.json'))
  if (files.length === 0) {
    console.log('No manifests found.')
    return
  }

  console.log(`\nManifests in ${MANIFEST_DIR}:\n`)
  for (const file of files) {
    const manifest = JSON.parse(readFileSync(join(MANIFEST_DIR, file), 'utf8')) as EventManifest
    const statusIcon = manifest.status === 'ready' ? '✅' :
      manifest.status === 'failed' ? '❌' :
      manifest.status === 'pending' ? '⏳' :
      manifest.status === 'processing' ? '🔄' :
      manifest.status === 'partial' ? '⚠️' : '❓'
    console.log(`  ${statusIcon} ${manifest.event_id} [${manifest.event_type}] → ${manifest.status}`)
  }
  console.log()
}

// ── Process Single ───────────────────────────────────────────────────────────

async function processSingle(eventId: string): Promise<void> {
  const manifestPath = join(MANIFEST_DIR, `${eventId}.json`)
  if (!existsSync(manifestPath)) {
    console.error(`Error: No manifest found for event_id: ${eventId}`)
    process.exit(1)
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as EventManifest
  console.log(`Processing manifest: ${eventId} (current status: ${manifest.status})`)

  // Update to processing
  manifest.status = 'processing'
  manifest.updated_at = new Date().toISOString()
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')

  try {
    const { handleBlogPipelineRequest } = await import('./handler.ts')
    const payload = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const result = await handleBlogPipelineRequest(payload, manifest)

    manifest.status = result.status
    manifest.assets = result.assets
    manifest.error = result.error
    manifest.updated_at = new Date().toISOString()
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')

    console.log(`Result: ${result.status}`)
    if (result.error) {
      console.error(`Error: ${result.error.message}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Failed: ${message}`)
    manifest.status = 'failed'
    manifest.error = { code: 'CLI_ERROR', message }
    manifest.updated_at = new Date().toISOString()
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
    process.exit(1)
  }
}

// ── Process All ──────────────────────────────────────────────────────────────

async function processAll(): Promise<void> {
  if (!existsSync(MANIFEST_DIR)) {
    console.log('No manifests directory found.')
    return
  }

  const files = readdirSync(MANIFEST_DIR).filter((f) => f.endsWith('.json'))
  const pending = files.filter((f) => {
    const manifest = JSON.parse(readFileSync(join(MANIFEST_DIR, f), 'utf8')) as EventManifest
    return manifest.status === 'pending' && manifest.event_type.startsWith('blog-pipeline')
  })

  if (pending.length === 0) {
    console.log('No pending manifests.')
    return
  }

  console.log(`Found ${pending.length} pending manifest(s).`)

  for (const file of pending) {
    const manifest = JSON.parse(readFileSync(join(MANIFEST_DIR, file), 'utf8')) as EventManifest
    console.log(`\nProcessing: ${manifest.event_id}`)
    await processSingle(manifest.event_id)
  }

  console.log('\nAll pending manifests processed.')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'event-id': { type: 'string' },
      all: { type: 'boolean' },
      list: { type: 'boolean' },
      help: { type: 'boolean' },
    },
  })

  if (values.help || process.argv.length === 2) {
    showHelp()
    return
  }

  if (values.list) {
    listManifests()
    return
  }

  if (values.all) {
    await processAll()
    return
  }

  if (values['event-id']) {
    await processSingle(values['event-id'])
    return
  }

  showHelp()
}

main().catch((err) => {
  console.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
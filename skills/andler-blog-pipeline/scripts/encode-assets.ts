/**
 * andler-blog-pipeline — encode-assets.ts
 *
 * CLI wrapper around the shared encodeWebP function from handler.ts.
 * Preserves quality with effort: 6 + preset: 'photo'.
 * Falls back to quality reduction only if size exceeds cap.
 *
 * Usage:
 *   bun run scripts/encode-assets.ts --input <png-path> --output <webp-path> [--max-bytes 4194304]
 */

import { existsSync, statSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { encodeWebP } from './handler.ts'

// ── Config ──────────────────────────────────────────────────────────────────

const MAX_ASSET_BYTES = Number(process.env.BLOG_PIPELINE_MAX_ASSET_BYTES ?? 4_194_304)

// ── CLI ───────────────────────────────────────────────────────────────────────

function parseCliArgs(): { input: string; output: string; maxBytes: number | undefined } {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      input: { type: 'string', short: 'i' },
      output: { type: 'string', short: 'o' },
      'max-bytes': { type: 'string', short: 'm' },
    },
  })

  if (!values.input || !values.output) {
    console.error('Usage: bun run scripts/encode-assets.ts --input <png> --output <webp> [--max-bytes N]')
    process.exit(1)
  }

  return {
    input: values.input,
    output: values.output,
    maxBytes: values['max-bytes'] ? Number(values['max-bytes']) : undefined,
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { input, output, maxBytes } = parseCliArgs()

  if (!existsSync(input)) {
    console.error(`Error: Input file not found: ${input}`)
    process.exit(1)
  }

  // Delegate to the canonical encodeWebP in handler.ts.
  // handler.ts encodeWebP uses BLOG_PIPELINE_MAX_ASSET_BYTES env var for the size cap.
  // For CLI --max-bytes override, temporarily set the env var.
  if (maxBytes !== undefined) {
    process.env.BLOG_PIPELINE_MAX_ASSET_BYTES = String(maxBytes)
  }

  const sizeBytes = await encodeWebP(input, output)
  console.log(`Done: ${output} (${sizeBytes} bytes)`)
}

main().catch((err) => {
  console.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
/**
 * andler-blog-pipeline — encode-assets.ts
 *
 * WebP encoding helper using sharp.
 * Preserves quality with effort: 6 + preset: 'photo'.
 * Falls back to quality reduction only if size exceeds cap.
 *
 * Usage:
 *   bun run scripts/encode-assets.ts --input <png-path> --output <webp-path> [--max-bytes 4194304]
 */

import { existsSync, statSync } from 'node:fs'
import { parseArgs } from 'node:util'

// ── Config ──────────────────────────────────────────────────────────────────

const MAX_ASSET_BYTES = Number(process.env.BLOG_PIPELINE_MAX_ASSET_BYTES ?? 4_194_304)

// ── CLI ───────────────────────────────────────────────────────────────────────

function parseCliArgs(): { input: string; output: string; maxBytes: number } {
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
    maxBytes: values['max-bytes'] ? Number(values['max-bytes']) : MAX_ASSET_BYTES,
  }
}

// ── Encode ────────────────────────────────────────────────────────────────────

async function encodeWebP(inputPath: string, outputPath: string, maxBytes: number): Promise<void> {
  const sharp = (await import('sharp')).default

  if (!existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`)
    process.exit(1)
  }

  // First pass: max quality, effort 6, photo preset
  await sharp(inputPath)
    .webp({ effort: 6, preset: 'photo', quality: 100 })
    .toFile(outputPath)

  let fileSize = statSync(outputPath).size
  console.log(`Initial encoding: ${fileSize} bytes (quality 100)`)

  if (fileSize <= maxBytes) {
    console.log(`✅ Under size cap (${maxBytes} bytes)`)
    return
  }

  // Progressive quality reduction
  const qualitySteps = [90, 80, 70, 60, 50]
  for (const quality of qualitySteps) {
    await sharp(inputPath)
      .webp({ effort: 6, preset: 'photo', quality })
      .toFile(outputPath)

    fileSize = statSync(outputPath).size
    console.log(`Quality ${quality}: ${fileSize} bytes`)

    if (fileSize <= maxBytes) {
      console.log(`✅ Under size cap at quality ${quality}`)
      return
    }
  }

  console.warn(`⚠️  Still exceeds size cap at quality 50 (${fileSize} > ${maxBytes}). Keeping best effort.`)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { input, output, maxBytes } = parseCliArgs()
  await encodeWebP(input, output, maxBytes)
  console.log(`Done: ${output}`)
}

main().catch((err) => {
  console.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
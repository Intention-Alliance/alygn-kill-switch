/**
 * andler-blog-pipeline — handler.ts
 *
 * Handler module that registers with openclaw-webhook for
 * event_type: "blog-pipeline.request".
 * Orchestrates nano-banana-pro for image generation.
 * Encodes WebP with sharp (effort: 6 + preset: 'photo').
 * Tracks GIFs as URL references (not base64).
 * Writes resulting manifest to OPENCLAW_MANIFEST_DIR/<event_id>.json.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

// Register with openclaw-webhook at module load time
import { registerHandler } from '../../openclaw-webhook/scripts/server.ts'

// ── Types ──────────────────────────────────────────────────────────────────

interface BlogAssetRequest {
  type: string
  prompt: string
  width: number
  height: number
  alt_text: string
  target_path: string
}

interface BlogPipelinePayload {
  slug: string
  title: string
  excerpt?: string
  category: string
  palette?: string
  assets: BlogAssetRequest[]
}

interface GeneratedAsset {
  type: string
  path: string
  base64: string
  sha256: string
  mime: string
  size_bytes: number
  url?: string
}

interface HandlerResult {
  status: 'processing' | 'ready' | 'failed' | 'partial'
  assets?: GeneratedAsset[]
  error?: { code: string; message: string; failed_assets?: Array<{ type: string; reason: string }> }
}

interface EventManifest {
  event_id: string
  event_type: string
  requester: string
  payload_sha256: string
  created_at: string
  expires_at: string
  status: 'pending' | 'processing' | 'ready' | 'failed' | 'partial'
  handler: string
  assets?: GeneratedAsset[]
  error?: { code: string; message: string; failed_assets?: Array<{ type: string; reason: string }> }
  updated_at: string
}

// ── Config ──────────────────────────────────────────────────────────────────

const OUTPUT_DIR = process.env.BLOG_PIPELINE_OUTPUT_DIR ??
  join(process.env.HOME ?? '/home/andlersrv', '.openclaw/workspace/.staging/blog-pipeline-assets/')
const MAX_ASSET_BYTES = Number(process.env.BLOG_PIPELINE_MAX_ASSET_BYTES ?? 4_194_304) // 4MB
const LOG_LEVEL = process.env.BLOG_PIPELINE_LOG_LEVEL ?? 'info'
const NANO_BANANA_PATH = process.env.BLOG_PIPELINE_NANO_BANANA_PATH ??
  join(process.env.HOME ?? '/home/andlersrv', '.openclaw/workspace/skills/nano-banana-pro/scripts/generate_image.py')
const GEMINI_API_KEY = process.env.BLOG_PIPELINE_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY ?? ''

// ── Logger ──────────────────────────────────────────────────────────────────

function log(level: string, message: string, meta?: Record<string, unknown>): void {
  const levels = ['debug', 'info', 'warn', 'error']
  if (levels.indexOf(level) < levels.indexOf(LOG_LEVEL)) return
  const timestamp = new Date().toISOString()
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : ''
  console.log(`[${timestamp}] [blog-pipeline] [${level.toUpperCase()}] ${message}${metaStr}`)
}

// ── Handler Registration ─────────────────────────────────────────────────────

registerHandler('blog-pipeline.request', async (payload, manifest) => {
  return handleBlogPipelineRequest(payload, manifest as EventManifest)
})

// ── Image Generation ──────────────────────────────────────────────────────────

function generateImage(prompt: string, filename: string, width?: number, height?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['run', NANO_BANANA_PATH, '--prompt', prompt, '--filename', filename]

    if (width && height) {
      // nano-banana-pro uses resolution tiers, not exact dimensions
      // Map to closest tier: 1K for <1080, 2K for <2048, 4K for >=2048
      const maxDim = Math.max(width, height)
      const resolution = maxDim >= 2048 ? '4K' : maxDim >= 1080 ? '2K' : '1K'
      args.push('--resolution', resolution)
    }

    if (GEMINI_API_KEY) {
      args.push('--api-key', GEMINI_API_KEY)
    }

    log('debug', `Spawning nano-banana-pro: uv ${args.join(' ')}`)

    const proc = spawn('uv', args, {
      cwd: OUTPUT_DIR,
      timeout: 120_000, // 2 min max per image
      env: { ...process.env, GEMINI_API_KEY },
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => { stdout += data.toString() })
    proc.stderr.on('data', (data) => { stderr += data.toString() })

    proc.on('close', (code) => {
      if (code !== 0) {
        log('error', `nano-banana-pro failed (exit ${code}): ${stderr.slice(0, 200)}`)
        reject(new Error(`Image generation failed: ${stderr.slice(0, 100)}`))
        return
      }

      // Find the output path from stdout
      const pathMatch = stdout.match(/saved.*?:\s*(.+)/i) ?? stdout.match(/(.+\.png)/i)
      if (pathMatch) {
        resolve(pathMatch[1].trim())
      } else {
        // Fallback: assume it's in the output dir
        resolve(join(OUTPUT_DIR, filename))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn nano-banana-pro: ${err.message}`))
    })
  })
}

// ── WebP Encoding ────────────────────────────────────────────────────────────

async function encodeWebP(inputPath: string, outputPath: string): Promise<number> {
  const sharp = await import('sharp')

  const stats = await sharp.default(inputPath)
    .webp({
      effort: 6,
      preset: 'photo',
      quality: 100, // Start with max quality — reduce only if over size cap
    })
    .toFile(outputPath)

  const fileSize = stats.size
  log('debug', `WebP encoded: ${outputPath} (${fileSize} bytes)`)

  // If over size cap, progressively reduce quality
  if (fileSize > MAX_ASSET_BYTES) {
    log('warn', `Asset exceeds size cap (${fileSize} > ${MAX_ASSET_BYTES}), reducing quality`)
    let quality = 90
    while (quality >= 50 && fileSize > MAX_ASSET_BYTES) {
      await sharp.default(inputPath)
        .webp({ effort: 6, preset: 'photo', quality })
        .toFile(outputPath)
      const newStats = await sharp.default(outputPath).metadata()
      // Re-check file size
      const { statSync } = await import('node:fs')
      const newSize = statSync(outputPath).size
      log('debug', `Quality ${quality}: ${newSize} bytes`)
      if (newSize <= MAX_ASSET_BYTES) break
      quality -= 10
    }
  }

  const { statSync } = await import('node:fs')
  return statSync(outputPath).size
}

// ── SHA-256 + Base64 ────────────────────────────────────────────────────────

function fileToBase64AndHash(filePath: string): { base64: string; sha256: string; sizeBytes: number } {
  const buffer = readFileSync(filePath)
  const sha256 = createHash('sha256').update(buffer).digest('hex')
  const base64 = buffer.toString('base64')
  return { base64, sha256, sizeBytes: buffer.length }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function handleBlogPipelineRequest(
  payload: unknown,
  manifest: EventManifest,
): Promise<HandlerResult> {
  const request = payload as BlogPipelinePayload

  if (!request.slug || !request.assets || !Array.isArray(request.assets)) {
    return {
      status: 'failed',
      error: { code: 'INVALID_PAYLOAD', message: 'Missing required fields: slug, assets' },
    }
  }

  log('info', `Processing blog-pipeline request for slug: ${request.slug}`, {
    assetCount: request.assets.length,
  })

  // Ensure output directory exists
  const slugDir = join(OUTPUT_DIR, request.slug)
  if (!existsSync(slugDir)) {
    mkdirSync(slugDir, { recursive: true })
  }

  const results: GeneratedAsset[] = []
  const failedAssets: Array<{ type: string; reason: string }> = []

  for (const asset of request.assets) {
    try {
      log('info', `Generating ${asset.type} for ${request.slug}`)

      const isGif = asset.type === 'gif'

      if (isGif) {
        // GIFs: generate as GIF, store as URL reference
        const gifFilename = `${asset.type}.gif`
        const gifPath = join(slugDir, gifFilename)
        await generateImage(asset.prompt, gifFilename, asset.width, asset.height)
        const { sha256, sizeBytes } = fileToBase64AndHash(gifPath)

        results.push({
          type: asset.type,
          path: asset.target_path,
          base64: '', // GIFs are NOT base64-embedded
          sha256,
          mime: 'image/gif',
          size_bytes: sizeBytes,
          url: `https://andlersrv.tail62d797.ts.net/blog-assets/${request.slug}/${gifFilename}`,
        })
      } else {
        // WebP assets: generate PNG, encode to WebP
        const pngFilename = `${asset.type}-${Date.now()}.png`
        const webpFilename = `${asset.type}.webp`
        const pngPath = join(slugDir, pngFilename)
        const webpPath = join(slugDir, webpFilename)

        // Generate the image via nano-banana-pro
        await generateImage(asset.prompt, pngFilename, asset.width, asset.height)

        // Encode to WebP with quality preservation
        const sizeBytes = await encodeWebP(pngPath, webpPath)

        // Get base64 + SHA-256
        const { base64, sha256 } = fileToBase64AndHash(webpPath)

        results.push({
          type: asset.type,
          path: asset.target_path,
          base64,
          sha256,
          mime: 'image/webp',
          size_bytes: sizeBytes,
        })

        // Clean up the intermediate PNG
        try {
          const { unlinkSync } = await import('node:fs')
          unlinkSync(pngPath)
        } catch {
          // Non-fatal — PNG cleanup is best-effort
        }
      }

      log('info', `Asset ${asset.type} ready for ${request.slug}`)
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown error'
      log('error', `Asset ${asset.type} failed for ${request.slug}: ${reason}`)
      failedAssets.push({ type: asset.type, reason })
    }
  }

  // Determine final status
  const successCount = results.length
  const failCount = failedAssets.length
  const total = request.assets.length

  let status: HandlerResult['status']
  let error: HandlerResult['error']

  if (failCount === 0) {
    status = 'ready'
  } else if (successCount === 0) {
    status = 'failed'
    error = {
      code: 'GENERATION_FAILED',
      message: `${failCount}/${total} assets failed after max retries`,
      failed_assets: failedAssets,
    }
  } else {
    status = 'partial'
    error = {
      code: 'PARTIAL_FAILURE',
      message: `${failCount}/${total} assets failed`,
      failed_assets: failedAssets,
    }
  }

  log('info', `Blog-pipeline complete for ${request.slug}: ${status} (${successCount}/${total} assets)`)

  return { status, assets: results, error }
}
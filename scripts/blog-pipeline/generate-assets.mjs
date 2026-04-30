#!/usr/bin/env node

/**
 * generate-assets.mjs — Blog Pipeline Asset Generator (Task #55)
 *
 * Thin wrapper around OpenAI image generation for brand-consistent blog
 * thumbnails (1200×630) and covers (1920×1080).
 *
 * Usage:
 *   node generate-assets.mjs --title "My Article" --category "Deep Dive" \
 *     --tags "AI,Infrastructure" --output-dir ./assets
 *
 * Output:
 *   JSON → { thumbnail: "path", cover: "path", success: true }
 *
 * Deps: Node ≥18 (native fetch + fs).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';

// ── Config ────────────────────────────────────────────────────────────

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY ?? process.env.OPENAI_KEY ?? '';

const IMAGE_MODEL = process.env.IMAGE_MODEL ?? 'dall-e-3';
const IMAGE_QUALITY = process.env.IMAGE_QUALITY ?? 'hd';
const IMAGE_STYLE = process.env.IMAGE_STYLE ?? 'vivid';

const BRAND_AESTHETIC =
  'minimalist, monochrome, clean lines, bold high contrast, ' +
  'Infobae-inspired, professional tech aesthetic, geometric composition, ' +
  'deep blacks, bright whites, no text, no faces';

const DIMENSIONS = {
  thumbnail: { size: '1792x1024', display: '1200×630', ar: '16:9-landscape' },
  cover: { size: '1792x1024', display: '1920×1080', ar: '16:9-hero' },
};

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2_000;

// ── Helpers ───────────────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Hash prompt → deterministic log fingerprint (for debugging). */
function promptFingerprint(prompt) {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 12);
}

// ── Prompt Builder ────────────────────────────────────────────────────

/**
 * Build the full DALL-E prompt for a given asset kind.
 * @param {'thumbnail'|'cover'} kind
 * @param {{title: string, category: string, tags: string[]}} meta
 */
function buildPrompt(kind, meta) {
  const { title, category, tags } = meta;
  const dim = DIMENSIONS[kind];
  const role = kind === 'thumbnail'
    ? 'OG-image social card thumbnail'
    : 'hero banner cover image';

  const lines = [
    `A professional ${role} for a tech blog article titled "${title}".`,
    kind === 'cover'
      ? 'Wide cinematic hero composition with strong architectural geometry. Deep negative space on the right half for title overlay.'
      : 'Tight editorial composition. The subject occupies the left-center third; the right two-thirds is deep shadow or negative space for metadata overlay.',
    `Category: ${category}. Tags: ${tags.join(', ')}.`,
    `Style constraint: ${BRAND_AESTHETIC}.`,
    'No text, no letters, no words, no glyphs anywhere in the image.',
    'No human faces, no portraits, no figures.',
    `Aspect ratio: ${dim.ar}.`,
  ];

  return lines.join('\n');
}

// ── OpenAI API ────────────────────────────────────────────────────────

/**
 * Call OpenAI Images API.
 * @param {string} prompt
 * @param {'thumbnail'|'cover'} kind
 * @returns {Promise<{url: string, revised_prompt: string}>}
 */
async function generateImage(prompt, kind) {
  if (!OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY not set. Export it or set in environment.',
    );
  }

  const dim = DIMENSIONS[kind];

  const body = {
    model: IMAGE_MODEL,
    prompt,
    n: 1,
    size: dim.size,
    quality: IMAGE_QUALITY,
    style: IMAGE_STYLE,
  };

  let lastErr;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '(no body)');
        throw new Error(`OpenAI ${res.status}: ${errBody.slice(0, 300)}`);
      }

      const json = await res.json();
      const image = json.data?.[0];
      if (!image?.url) {
        throw new Error('OpenAI returned no image URL');
      }

      return {
        url: image.url,
        revised_prompt: image.revised_prompt ?? prompt,
      };
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        console.error(
          `[generate-assets] Retry ${attempt}/${MAX_RETRIES} for ${kind}…`,
        );
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw lastErr;
}

/**
 * Download an image URL → local file buffer.
 */
async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// ── Main Pipeline ─────────────────────────────────────────────────────

async function main() {
  // ---- Parse CLI args ----
  const args = parseArgs(process.argv.slice(2));

  const title = args.title || args._?.[0];
  if (!title) {
    console.error('ERROR: --title is required');
    process.exit(1);
  }

  const category = args.category ?? 'Deep Dive';
  const tagsStr = args.tags ?? '';
  const tags = tagsStr
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);

  const outputDir = resolve(args['output-dir'] ?? args.outputDir ?? '.');
  await mkdir(outputDir, { recursive: true });

  const slug = slugify(title);
  const date = todayISO();
  const meta = { title, category, tags };

  const results = { thumbnail: null, cover: null, success: false };

  // ---- Generate thumbnail ----
  console.error(`[generate-assets] 🖼  Generating thumbnail for "${title}"…`);
  let thumbPrompt, thumbUrl, thumbData, thumbPath;
  try {
    thumbPrompt = buildPrompt('thumbnail', meta);
    console.error(`[generate-assets]   prompt fingerprint: ${promptFingerprint(thumbPrompt)}`);
    const { url, revised_prompt } = await generateImage(thumbPrompt, 'thumbnail');
    thumbUrl = url;
    console.error(`[generate-assets]   ✅ thumbnail generated via ${IMAGE_MODEL}`);

    thumbData = await downloadImage(url);
    const thumbFilename = `${date}-${slug}-thumb.png`;
    thumbPath = resolve(outputDir, thumbFilename);
    await writeFile(thumbPath, thumbData);
    console.error(`[generate-assets]   💾 saved → ${thumbPath} (${(thumbData.length / 1024).toFixed(1)} KB)`);
    results.thumbnail = thumbPath;
  } catch (err) {
    console.error(`[generate-assets] ❌ Thumbnail failed: ${err.message}`);
    results.thumbnail_error = err.message;
  }

  // ---- Generate cover ----
  console.error(`[generate-assets] 🖼  Generating cover for "${title}"…`);
  let coverPrompt, coverUrl, coverData, coverPath;
  try {
    coverPrompt = buildPrompt('cover', meta);
    console.error(`[generate-assets]   prompt fingerprint: ${promptFingerprint(coverPrompt)}`);
    const { url, revised_prompt } = await generateImage(coverPrompt, 'cover');
    coverUrl = url;
    console.error(`[generate-assets]   ✅ cover generated via ${IMAGE_MODEL}`);

    coverData = await downloadImage(url);
    const coverFilename = `${date}-${slug}-cover.png`;
    coverPath = resolve(outputDir, coverFilename);
    await writeFile(coverPath, coverData);
    console.error(`[generate-assets]   💾 saved → ${coverPath} (${(coverData.length / 1024).toFixed(1)} KB)`);
    results.cover = coverPath;
  } catch (err) {
    console.error(`[generate-assets] ❌ Cover failed: ${err.message}`);
    results.cover_error = err.message;
  }

  // ---- Determine success ----
  results.success = !!(results.thumbnail && results.cover);

  // ---- Output JSON (stdout for pipeline consumers) ----
  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  process.exit(results.success ? 0 : 1);
}

// ── Argument Parser (lightweight, no deps) ────────────────────────────

function parseArgs(argv) {
  const result = { _: [] };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        // --key=value
        const key = arg.slice(2, eqIdx);
        result[key] = arg.slice(eqIdx + 1);
      } else {
        // --key value or --flag
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('-')) {
          result[key] = next;
          i++;
        } else {
          result[key] = true;
        }
      }
    } else if (arg.startsWith('-')) {
      // Short flags not needed for this script
      result[arg] = true;
    } else {
      result._.push(arg);
    }
    i++;
  }
  return result;
}

// ── Run ───────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error(`[generate-assets] Fatal: ${err.message}`);
  process.exit(2);
});

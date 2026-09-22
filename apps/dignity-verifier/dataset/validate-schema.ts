/**
 * Seed dataset schema validator + semantic dedup reporter.
 *
 * Validates every JSONL file under `dataset/seed/` against the canonical
 * schema `{ id, prompt, output, verdict, reason, category, source }` and
 * reports:
 *   - total count and per-verdict counts
 *   - schema errors (missing/invalid fields)
 *   - exact duplicates (prompt + output)
 *   - PII flags (email, phone, SSN, credit card, IP)
 *
 * With `--dedup`, embeds all prompts via `nomic-embed-text-v2-moe` (local
 * Ollama) and flags any pair with cosine similarity > 0.92. Flagged pairs are
 * reported for review — nothing is removed.
 *
 * Exit code is non-zero on any validation failure.
 *
 * Run:
 *   bun run apps/dignity-verifier/dataset/validate-schema.ts
 *   bun run apps/dignity-verifier/dataset/validate-schema.ts --dedup
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Verdict = 'SAFE' | 'UNSAFE' | 'REVIEW'

interface SeedRecord {
  id: string
  prompt: string
  output: string
  verdict: Verdict
  reason: string
  category: string
  source: string
}

const SEED_DIR = join(import.meta.dir, 'seed')
const FILES = ['safe', 'unsafe', 'review', 'injection'] as const
const VALID_VERDICTS: readonly Verdict[] = ['SAFE', 'UNSAFE', 'REVIEW']
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const EMBED_MODEL = 'nomic-embed-text-v2-moe:latest'
const COSINE_THRESHOLD = 0.92

interface ValidationReport {
  file: string
  count: number
  verdictCounts: Record<string, number>
  schemaErrors: string[]
  exactDuplicates: Array<{ idA: string; idB: string }>
  piiFlags: Array<{ id: string; type: string; match: string }>
}

const PII_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: 'email', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { type: 'phone', pattern: /\+?\d[\d\s\-()]{7,}\d/ },
  { type: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { type: 'credit_card', pattern: /\b(?:\d[ -]?){13,16}\b/ },
  { type: 'ip_address', pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/ },
]

function parseRecords(file: string): Array<Record<string, unknown>> {
  const path = join(SEED_DIR, `${file}.jsonl`)
  const lines = readFileSync(path, 'utf-8').split('\n').filter((l) => l.trim() !== '')
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>)
}

function validateRecord(rec: Record<string, unknown>, index: number): string[] {
  const errors: string[] = []
  const label = `record[${index}]`
  for (const field of ['id', 'prompt', 'output', 'verdict', 'reason', 'category', 'source'] as const) {
    const value = rec[field]
    if (value === undefined || value === null || value === '') {
      errors.push(`${label}: missing field "${field}"`)
    }
  }
  if (rec.verdict !== undefined && !VALID_VERDICTS.includes(rec.verdict as Verdict)) {
    errors.push(`${label}: invalid verdict "${String(rec.verdict)}" (expected SAFE|UNSAFE|REVIEW)`)
  }
  return errors
}

function scanPii(rec: Record<string, unknown>): Array<{ type: string; match: string }> {
  const text = `${String(rec.prompt ?? '')} ${String(rec.output ?? '')}`
  const flags: Array<{ type: string; match: string }> = []
  for (const { type, pattern } of PII_PATTERNS) {
    const match = text.match(pattern)
    if (match) flags.push({ type, match: match[0] })
  }
  return flags
}

function validateFile(file: string): ValidationReport {
  const records = parseRecords(file)
  const report: ValidationReport = {
    file,
    count: records.length,
    verdictCounts: {},
    schemaErrors: [],
    exactDuplicates: [],
    piiFlags: [],
  }

  const seen = new Map<string, string>() // key -> id
  records.forEach((rec, i) => {
    report.schemaErrors.push(...validateRecord(rec, i))
    const verdict = rec.verdict as string
    report.verdictCounts[verdict] = (report.verdictCounts[verdict] ?? 0) + 1
    const id = String(rec.id ?? `?${i}`)
    const key = `${String(rec.prompt)}||${String(rec.output)}`
    if (seen.has(key)) {
      report.exactDuplicates.push({ idA: seen.get(key) as string, idB: id })
    } else {
      seen.set(key, id)
    }
    report.piiFlags.push(...scanPii(rec).map((f) => ({ id, ...f })))
  })

  return report
}

// ─── Semantic dedup (embedding-based) ─────────────────────────────

interface EmbedResponse {
  embeddings: number[][]
}

async function embed(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  })
  if (!res.ok) throw new Error(`embed request failed: ${res.status} ${res.statusText}`)
  const data = (await res.json()) as EmbedResponse
  return data.embeddings
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

async function semanticDedup(): Promise<void> {
  const all: Array<{ id: string; prompt: string }> = []
  for (const file of FILES) {
    for (const rec of parseRecords(file)) {
      all.push({ id: String(rec.id), prompt: String(rec.prompt) })
    }
  }

  console.log(`\n[dedup] embedding ${all.length} prompts via ${EMBED_MODEL} ...`)
  const embeddings = await embed(all.map((r) => r.prompt))
  console.log(`[dedup] got ${embeddings.length} embeddings (dim ${embeddings[0]?.length ?? 0})`)

  const flagged: Array<{ idA: string; idB: string; similarity: number }> = []
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const sim = cosine(embeddings[i] as number[], embeddings[j] as number[])
      if (sim > COSINE_THRESHOLD) {
        flagged.push({ idA: all[i]?.id as string, idB: all[j]?.id as string, similarity: sim })
      }
    }
  }

  flagged.sort((a, b) => b.similarity - a.similarity)
  console.log(`[dedup] pairs with cosine > ${COSINE_THRESHOLD}: ${flagged.length}`)
  for (const f of flagged) {
    console.log(`  ${f.idA} <-> ${f.idB}  (cosine ${f.similarity.toFixed(4)})`)
  }
}

// ─── Main ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dedup = process.argv.includes('--dedup')
  const reports = FILES.map(validateFile)

  let total = 0
  let totalErrors = 0
  let totalDups = 0
  let totalPii = 0

  console.log('=== Seed Dataset Validation ===\n')
  for (const r of reports) {
    total += r.count
    totalErrors += r.schemaErrors.length
    totalDups += r.exactDuplicates.length
    totalPii += r.piiFlags.length
    console.log(`[${r.file}.jsonl] count=${r.count}`)
    console.log(`  verdicts: ${JSON.stringify(r.verdictCounts)}`)
    if (r.schemaErrors.length > 0) {
      console.log(`  SCHEMA ERRORS (${r.schemaErrors.length}):`)
      for (const e of r.schemaErrors) console.log(`    - ${e}`)
    }
    if (r.exactDuplicates.length > 0) {
      console.log(`  EXACT DUPLICATES (${r.exactDuplicates.length}):`)
      for (const d of r.exactDuplicates) console.log(`    - ${d.idA} == ${d.idB}`)
    }
    if (r.piiFlags.length > 0) {
      console.log(`  PII FLAGS (${r.piiFlags.length}):`)
      for (const p of r.piiFlags) console.log(`    - ${p.id}: ${p.type} = ${p.match}`)
    }
    console.log('')
  }

  console.log(`=== Totals ===`)
  console.log(`total records: ${total}`)
  console.log(`schema errors: ${totalErrors}`)
  console.log(`exact duplicates: ${totalDups}`)
  console.log(`pii flags: ${totalPii}`)

  if (dedup) {
    await semanticDedup()
  }

  const failed = totalErrors > 0 || totalDups > 0
  console.log(`\nRESULT: ${failed ? 'FAIL' : 'PASS'}`)
  if (failed) process.exit(1)
}

await main()

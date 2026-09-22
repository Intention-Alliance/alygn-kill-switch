/**
 * One-off migration: add `id` and `source` fields to seed dataset records.
 *
 * The documented schema (see dataset/README.md) is:
 *   { id, prompt, output, verdict, reason, category, source }
 *
 * The existing seed files only carried { prompt, output, verdict, reason,
 * category }. This migration backfills the missing `id` (deterministic,
 * `seed-<file>-<NNN>`) and `source: "seed"` fields so the dataset conforms
 * to the canonical schema before validation and augmentation.
 *
 * Run: bun run apps/dignity-verifier/dataset/migrate-add-id-source.ts
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface SeedRecord {
  id: string
  prompt: string
  output: string
  verdict: string
  reason: string
  category: string
  source: string
}

const SEED_DIR = join(import.meta.dir, 'seed')
const FILES = ['safe', 'unsafe', 'review', 'injection'] as const

function pad(n: number, width = 3): string {
  return String(n).padStart(width, '0')
}

function migrateFile(file: string): number {
  const path = join(SEED_DIR, `${file}.jsonl`)
  const lines = readFileSync(path, 'utf-8').split('\n').filter((l) => l.trim() !== '')
  const migrated = lines.map((line, i) => {
    const rec = JSON.parse(line) as Omit<SeedRecord, 'id' | 'source'>
    const id = rec.id ?? `seed-${file}-${pad(i + 1)}`
    return {
      id,
      prompt: rec.prompt,
      output: rec.output,
      verdict: rec.verdict,
      reason: rec.reason,
      category: rec.category,
      source: rec.source ?? 'seed',
    } satisfies SeedRecord
  })
  const out = migrated.map((r) => JSON.stringify(r)).join('\n') + '\n'
  writeFileSync(path, out, 'utf-8')
  return migrated.length
}

let total = 0
for (const file of FILES) {
  const n = migrateFile(file)
  total += n
  console.log(`migrated ${file}.jsonl: ${n} records`)
}
console.log(`total migrated: ${total}`)

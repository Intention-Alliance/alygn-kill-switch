import { Database } from 'bun:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dbPath = process.env.DATABASE_URL || './data/db.sqlite'
const sqlite = new Database(dbPath, { create: true, strict: true })

sqlite.run('PRAGMA journal_mode = WAL;')
sqlite.run('PRAGMA foreign_keys = ON;')

// Create migrations tracking table
sqlite.run(`
  CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  )
`)

const migrationsDir = join(import.meta.dir, '../drizzle')
const files = readdirSync(migrationsDir)
	.filter(f => f.endsWith('.sql'))
	.sort()

for (const file of files) {
	const sql = readFileSync(join(migrationsDir, file), 'utf-8')
	const hash = Bun.hash(sql).toString(16)

	const existing = sqlite.query('SELECT id FROM __drizzle_migrations WHERE hash = ?').get(hash)
	if (existing) {
		console.log(`⏭️  Skipping ${file} (already applied)`)
		continue
	}

	console.log(`📦 Running migration: ${file}`)
	sqlite.run('BEGIN')
	try {
		const statements = sql.split('--> statement-breakpoint')
		for (const stmt of statements) {
			const trimmed = stmt.trim()
			if (trimmed) sqlite.run(trimmed)
		}
		sqlite.run('INSERT INTO __drizzle_migrations (hash) VALUES (?)', [hash])
		sqlite.run('COMMIT')
		console.log(`✅ ${file} applied`)
	} catch (err) {
		sqlite.run('ROLLBACK')
		console.error(`❌ ${file} failed:`, err)
		process.exit(1)
	}
}

console.log('🔄 Migrations complete')
sqlite.close()

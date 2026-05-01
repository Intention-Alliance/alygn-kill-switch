import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'

/**
 * Initialize SQLite database connection
 */
const sqlite = new Database(process.env.DATABASE_URL || './data/db.sqlite', {
	create: true,
	strict: true,
})

// Enable WAL mode for better concurrency
sqlite.run('PRAGMA journal_mode = WAL;')
sqlite.run('PRAGMA foreign_keys = ON;')

/**
 * Drizzle ORM instance with schema
 */
export const db = drizzle(sqlite, { schema })

/**
 * Export raw sqlite for Better Auth
 */
export { sqlite }

/**
 * Export schema and types
 */
export * from './schema'

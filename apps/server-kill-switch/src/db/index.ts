import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import * as schema from './schema'

const DATA_DIR = process.env.DATA_DIR || './data'
const DB_PATH = `${DATA_DIR}/kill-switch.sqlite`
const migrationsFolder = resolve(import.meta.dir, '../../drizzle')

export function initDatabase(dbPath: string = DB_PATH) {
	mkdirSync(DATA_DIR, { recursive: true })

	const sqlite = new Database(dbPath, { create: true })
	sqlite.run('PRAGMA journal_mode=WAL')
	sqlite.run('PRAGMA foreign_keys=ON')
	sqlite.run('PRAGMA busy_timeout=5000')

	const db = drizzle(sqlite, { schema })
	const hasAppTables = sqlite
		.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='machine'")
		.get()
	const hasMigrationTable = sqlite
		.query(
			"SELECT 1 FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'",
		)
		.get()
	const appliedMigrations = hasMigrationTable
		? (sqlite
				.query(
					'SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at',
				)
				.all() as AppliedMigration[])
		: []
	const lastMigration = appliedMigrations.at(-1)
	const journal = JSON.parse(
		readFileSync(resolve(migrationsFolder, 'meta/_journal.json'), 'utf8'),
	) as MigrationJournal
	const lastJournalEntry = journal.entries.at(-1)
	if (!lastJournalEntry) {
		throw new Error('Drizzle migration journal is empty')
	}
	const journalHashes = new Map(
		journal.entries.map(({ tag, when }) => [
			when,
			createHash('sha256')
				.update(readFileSync(resolve(migrationsFolder, `${tag}.sql`)))
				.digest('hex'),
		]),
	)
	const hasValidHistory = appliedMigrations.every(
		({ hash, created_at }) => journalHashes.get(created_at) === hash,
	)
	const needsBaseline =
		!lastMigration ||
		(hasAppTables &&
			(!hasValidHistory || lastMigration.created_at !== lastJournalEntry.when))

	if (needsBaseline) {
		const missingRuntimeTables = [
			'verification_event',
			'inference_log',
			'decision_shadow_log',
		].filter(
			(table) =>
				!sqlite
					.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
					.get(table),
		)
		const baselineCount = hasAppTables ? 11 : 10
		const baselineEntries = journal.entries.filter(
			({ idx }) => idx < baselineCount,
		)

		if (baselineEntries.length !== baselineCount) {
			throw new Error(
				'Missing Drizzle migration journal entries for database baseline',
			)
		}
		if (lastMigration && !hasAppTables) {
			throw new Error(
				'Cannot baseline migration history without application tables',
			)
		}

		let needsFeatureFlagRebuild = false
		if (hasAppTables) {
			const snapshot = JSON.parse(
				readFileSync(
					resolve(migrationsFolder, 'meta/0009_snapshot.json'),
					'utf8',
				),
			) as MigrationSnapshot
			const missingBaselineTables = Object.keys(snapshot.tables).filter(
				(table) =>
					!sqlite
						.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
						.get(table),
			)
			if (missingBaselineTables.length > 0) {
				throw new Error(
					`Cannot baseline incomplete database: ${missingBaselineTables.join(', ')}`,
				)
			}

			for (const [table, requiredColumns] of Object.entries({
				machine: ['monitoring_only', 'zone'],
				kill_switch_audit_log: [
					'prev_hash',
					'self_hash',
					'actor_signature',
					'server_hmac',
					'plain_explanation',
				],
				user: ['role'],
			})) {
				const columns = sqlite
					.query(`PRAGMA table_info(${table})`)
					.all() as Array<{
					name: string
				}>
				const missingColumns = requiredColumns.filter(
					(column) => !columns.some(({ name }) => name === column),
				)
				if (missingColumns.length > 0) {
					throw new Error(
						`Cannot baseline incomplete ${table}: ${missingColumns.join(', ')}`,
					)
				}
			}

			const runtimeSnapshot = JSON.parse(
				readFileSync(
					resolve(migrationsFolder, 'meta/0010_snapshot.json'),
					'utf8',
				),
			) as MigrationSnapshot
			for (const table of [
				'verification_event',
				'inference_log',
				'decision_shadow_log',
			]) {
				if (missingRuntimeTables.includes(table)) continue
				const existingColumns = sqlite
					.query(`PRAGMA table_info(${table})`)
					.all() as Array<{
					name: string
				}>
				const expectedColumns = Object.keys(
					runtimeSnapshot.tables[table].columns,
				)
				const missingColumns = expectedColumns.filter(
					(column) => !existingColumns.some(({ name }) => name === column),
				)
				if (missingColumns.length > 0) {
					throw new Error(
						`Cannot baseline incomplete ${table}: ${missingColumns.join(', ')}`,
					)
				}
			}

			const featureFlagColumns = sqlite
				.query('PRAGMA table_info(feature_flag)')
				.all() as Array<{
				name: string
				type: string
			}>
			const missingFlagColumns = Object.keys(
				runtimeSnapshot.tables.feature_flag.columns,
			).filter(
				(column) => !featureFlagColumns.some(({ name }) => name === column),
			)
			if (missingFlagColumns.length > 0) {
				throw new Error(
					`Cannot baseline incomplete feature_flag: ${missingFlagColumns.join(', ')}`,
				)
			}
			const flagValueType = featureFlagColumns.find(
				({ name }) => name === 'value',
			)?.type
			if (!flagValueType) {
				throw new Error('Cannot baseline feature_flag without value column')
			}
			needsFeatureFlagRebuild = !flagValueType.toUpperCase().includes('TEXT')
		}

		const shouldDisableForeignKeys = needsFeatureFlagRebuild || !hasAppTables
		if (shouldDisableForeignKeys) {
			sqlite.run('PRAGMA foreign_keys=OFF')
		}
		try {
			sqlite.transaction(() => {
				if (!hasAppTables) {
					for (const { tag } of baselineEntries) {
						const migrationSql = readFileSync(
							resolve(migrationsFolder, `${tag}.sql`),
							'utf8',
						)
						applyMigrationStatements(sqlite, migrationSql)
					}
				} else if (missingRuntimeTables.length > 0 || needsFeatureFlagRebuild) {
					const runtimeMigration = readFileSync(
						resolve(migrationsFolder, '0010_reconcile-runtime-schema.sql'),
						'utf8',
					)
					const rebuildStart = runtimeMigration.indexOf(
						'PRAGMA foreign_keys=OFF',
					)
					if (rebuildStart === -1) {
						throw new Error(
							'Cannot locate feature_flag rebuild in runtime migration',
						)
					}
					applyMigrationStatements(
						sqlite,
						needsFeatureFlagRebuild
							? runtimeMigration
							: runtimeMigration.slice(0, rebuildStart),
					)
				}

				sqlite.run(
					'CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, hash TEXT NOT NULL, created_at NUMERIC)',
				)
				if (lastMigration) {
					sqlite.prepare('DELETE FROM __drizzle_migrations').run()
				}
				const insertMigration = sqlite.prepare(
					'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
				)
				for (const { tag, when } of baselineEntries) {
					const migrationSql = readFileSync(
						resolve(migrationsFolder, `${tag}.sql`),
						'utf8',
					)
					const hash = createHash('sha256').update(migrationSql).digest('hex')
					insertMigration.run(hash, when)
				}
			})()
		} finally {
			if (shouldDisableForeignKeys) {
				sqlite.run('PRAGMA foreign_keys=ON')
			}
		}
	}

	migrate(db, { migrationsFolder })

	const seedHostname = process.env.ALYGN_MACHINE_HOSTNAME ?? 'localhost'
	const seedMachineId = `machine-${seedHostname.split('.')[0]}`
	const seedMachineName =
		process.env.ALYGN_MACHINE_NAME ?? seedHostname.split('.')[0]
	sqlite.run(
		`INSERT OR IGNORE INTO machine (id, name, hostname, status, role, specs, created_at)
     VALUES (?, ?, ?, 'active', 'primary', '{"gpu":"none","cpu":"arch","cores":8}', strftime('%s','now') * 1000)`,
		[seedMachineId, seedMachineName, seedHostname],
	)

	console.log(`[db] SQLite initialized: ${dbPath} (WAL mode, tables verified)`)

	return { db, sqlite }
}

function applyMigrationStatements(
	sqlite: Database,
	migrationSql: string,
): void {
	for (const statement of migrationSql.split('--> statement-breakpoint')) {
		if (!statement.trim()) continue
		try {
			sqlite.exec(statement)
		} catch (error) {
			if (
				!(error instanceof Error) ||
				!error.message.includes('already exists') ||
				!/\bCREATE (?:TABLE|(?:UNIQUE )?INDEX)\b/i.test(statement)
			) {
				throw error
			}
		}
	}
}

const { db, sqlite } = initDatabase()

export { db, sqlite }

interface MigrationJournal {
	entries: Array<{ idx: number; tag: string; when: number }>
}

interface MigrationSnapshot {
	tables: Record<string, { columns: Record<string, unknown> }>
}

interface AppliedMigration {
	hash: string
	created_at: number
}

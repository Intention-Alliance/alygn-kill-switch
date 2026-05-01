import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// ============================================
// BETTER AUTH CORE TABLES
// ============================================

/**
 * User table - Better Auth core table
 * Extended with role and apiKeyHash for Kill Switch auth
 */
export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: integer('emailVerified', { mode: 'boolean' })
		.notNull()
		.default(false),
	image: text('image'),
	role: text('role', { enum: ['admin'] }).default('admin').notNull(),
	apiKeyHash: text('apiKeyHash').unique(),
	createdAt: integer('createdAt', { mode: 'timestamp' })
		.default(sql`(unixepoch())`)
		.notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' })
		.default(sql`(unixepoch())`)
		.notNull(),
})

/**
 * Session table - Better Auth core table
 */
export const session = sqliteTable('session', {
	id: text('id').primaryKey(),
	expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
	token: text('token').notNull().unique(),
	ipAddress: text('ipAddress'),
	userAgent: text('userAgent'),
	userId: text('userId')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	createdAt: integer('createdAt', { mode: 'timestamp' })
		.default(sql`(unixepoch())`)
		.notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' })
		.default(sql`(unixepoch())`)
		.notNull(),
})

/**
 * Account table - Better Auth core table (for email/password auth)
 */
export const account = sqliteTable('account', {
	id: text('id').primaryKey(),
	accountId: text('accountId').notNull(),
	providerId: text('providerId').notNull(),
	userId: text('userId')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('accessToken'),
	refreshToken: text('refreshToken'),
	idToken: text('idToken'),
	accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp' }),
	refreshTokenExpiresAt: integer('refreshTokenExpiresAt', {
		mode: 'timestamp',
	}),
	scope: text('scope'),
	password: text('password'),
	createdAt: integer('createdAt', { mode: 'timestamp' })
		.default(sql`(unixepoch())`)
		.notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' })
		.default(sql`(unixepoch())`)
		.notNull(),
})

/**
 * Verification table - Better Auth core table
 */
export const verification = sqliteTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
	createdAt: integer('createdAt', { mode: 'timestamp' }).default(
		sql`(unixepoch())`,
	),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }).default(
		sql`(unixepoch())`,
	),
})

// ============================================
// TYPE EXPORTS
// ============================================

export type User = typeof user.$inferSelect
export type NewUser = typeof user.$inferInsert
export type Session = typeof session.$inferSelect
export type NewSession = typeof session.$inferInsert
export type Account = typeof account.$inferSelect
export type NewAccount = typeof account.$inferInsert
export type Verification = typeof verification.$inferSelect
export type NewVerification = typeof verification.$inferInsert

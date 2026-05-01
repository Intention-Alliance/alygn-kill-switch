import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '@/db'

export const auth = betterAuth({
	// Use the Drizzle adapter with our existing schema
	database: drizzleAdapter(db, {
		provider: 'sqlite',
	}),

	// Email and password authentication
	emailAndPassword: {
		enabled: true,
		password: {
			hash: (input: string) => Bun.password.hash(input),
			verify: ({ password, hash }) => Bun.password.verify(password, hash),
		},
	},

	// Expose custom user fields (role) in getSession responses
	user: {
		additionalFields: {
			role: {
				type: 'string',
				required: false,
				defaultValue: 'admin',
				output: true,
				input: false,
			},
		},
	},

	trustedOrigins: ['https://andlersrv.tail62d797.ts.net:8443', 'http://localhost:3000'],
})

export type Auth = typeof auth

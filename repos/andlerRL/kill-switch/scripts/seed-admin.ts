import { auth } from '@/lib/auth'

async function seedAdmin() {
	const email = process.env.ADMIN_EMAIL || 'admin@alygn.com'
	const password = process.env.KILL_SWITCH_AUTH_TOKEN

	if (!password) {
		console.error('❌ KILL_SWITCH_AUTH_TOKEN environment variable is required')
		process.exit(1)
	}

	try {
		await auth.api.signUpEmail({
			body: {
				email,
				password,
				name: 'Admin',
			},
		})
		console.log('✅ Admin user created')
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err)
		if (message.includes('already exists')) {
			console.log('ℹ️ Admin user already exists')
		} else {
			console.error('❌ Failed to create admin user:', message)
			process.exit(1)
		}
	}
}

seedAdmin()

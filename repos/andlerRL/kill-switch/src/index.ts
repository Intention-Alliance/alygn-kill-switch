import { Elysia } from 'elysia'
import { auth } from '@/lib/auth'

const app = new Elysia()
	.get('/', () => ({ status: 'ok', version: '2.0.0' }))
	.get('/health', () => ({ status: 'healthy' }))
	// Catch-all: route /api/auth/** to Better Auth handler
	.all('/*', async ({ request, path, set }) => {
		if (path.startsWith('/api/auth')) {
			return auth.handler(request)
		}
		set.status = 404
		return { error: 'Not found' }
	})
	.listen(Number(process.env.PORT) || 3000)

console.log(`🚀 Kill Switch API v2 running at http://localhost:${app.server?.port}`)

export type App = typeof app

/**
 * Admin Routes — Role Gate Tests (P0-1)
 *
 * Covers the admin-only gate on /admin/* endpoints:
 *   - non-admin authenticated user (viewer) → 403
 *   - admin user → 200 (sanity)
 *   - unauthenticated (null role) → 403
 *
 * handleAdminRoutes receives the authenticated user's role from the
 * caller (index.ts runs it AFTER checkAuth) and verifies it before
 * responding. These tests exercise that gate in isolation.
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test'

// ─── Mock node:fs / fs ────────────────────────────────────────────
// admin.ts transitively imports resource-monitor.ts which uses
// `statfsSync` (not available in the bun test runtime). Stub it so the
// module graph loads cleanly. The admin gate tests never call it.
mock.module('node:fs', () => ({
	readdirSync: () => [],
	statfsSync: () => ({ bsize: 4096, blocks: 0, bfree: 0, bavail: 0 }),
}))
mock.module('fs', () => ({
	readdirSync: () => [],
	statfsSync: () => ({ bsize: 4096, blocks: 0, bfree: 0, bavail: 0 }),
}))

// ─── Helpers ──────────────────────────────────────────────────────

function createMockRes() {
	return {
		statusCode: 0,
		headers: {} as Record<string, string>,
		body: '',
		writeHead(code: number, headers: Record<string, string>) {
			this.statusCode = code
			this.headers = headers
		},
		end(data: string) {
			this.body = data
		},
	}
}

function getJson(res: any): any {
	return JSON.parse(res.body)
}

// Minimal service stub — admin routes only call into it for
// /admin/incidents/check, which we don't exercise here.
const mockService = {} as any

let handleAdminRoutes: any

beforeEach(async () => {
	const mod = await import('../admin')
	handleAdminRoutes = mod.handleAdminRoutes
})

// ─── Tests ────────────────────────────────────────────────────────

describe('Admin routes — role gate (P0-1)', () => {
	it('GET /admin/cost: viewer role → 403', async () => {
		const res = createMockRes()
		const handled = await handleAdminRoutes(
			'GET',
			'/admin/cost',
			{} as any,
			res,
			mockService,
			'viewer',
		)

		expect(handled).toBe(true)
		expect(res.statusCode).toBe(403)
		expect(getJson(res).error).toContain('Admin role required')
	})

	it('GET /admin/resources: viewer role → 403', async () => {
		const res = createMockRes()
		const handled = await handleAdminRoutes(
			'GET',
			'/admin/resources',
			{} as any,
			res,
			mockService,
			'viewer',
		)

		expect(handled).toBe(true)
		expect(res.statusCode).toBe(403)
		expect(getJson(res).error).toContain('Admin role required')
	})

	it('GET /admin/incidents: viewer role → 403', async () => {
		const res = createMockRes()
		const handled = await handleAdminRoutes(
			'GET',
			'/admin/incidents',
			{} as any,
			res,
			mockService,
			'viewer',
		)

		expect(handled).toBe(true)
		expect(res.statusCode).toBe(403)
		expect(getJson(res).error).toContain('Admin role required')
	})

	it('GET /admin/runbooks: viewer role → 403', async () => {
		const res = createMockRes()
		const handled = await handleAdminRoutes(
			'GET',
			'/admin/runbooks',
			{} as any,
			res,
			mockService,
			'viewer',
		)

		expect(handled).toBe(true)
		expect(res.statusCode).toBe(403)
		expect(getJson(res).error).toContain('Admin role required')
	})

	it('POST /admin/incidents/check: viewer role → 403', async () => {
		const res = createMockRes()
		const handled = await handleAdminRoutes(
			'POST',
			'/admin/incidents/check',
			{} as any,
			res,
			mockService,
			'viewer',
		)

		expect(handled).toBe(true)
		expect(res.statusCode).toBe(403)
		expect(getJson(res).error).toContain('Admin role required')
	})

	it('GET /admin/cost: unauthenticated (null role) → 403', async () => {
		const res = createMockRes()
		const handled = await handleAdminRoutes(
			'GET',
			'/admin/cost',
			{} as any,
			res,
			mockService,
			null,
		)

		expect(handled).toBe(true)
		expect(res.statusCode).toBe(403)
		expect(getJson(res).error).toContain('Admin role required')
	})

	it('GET /admin/cost: admin role → 200 (sanity)', async () => {
		const res = createMockRes()
		const handled = await handleAdminRoutes(
			'GET',
			'/admin/cost',
			{} as any,
			res,
			mockService,
			'admin',
		)

		expect(handled).toBe(true)
		expect(res.statusCode).toBe(200)
	})

	it('non-admin path falls through (returns false)', async () => {
		const res = createMockRes()
		const handled = await handleAdminRoutes(
			'GET',
			'/v1/settings',
			{} as any,
			res,
			mockService,
			'viewer',
		)

		expect(handled).toBe(false)
	})
})

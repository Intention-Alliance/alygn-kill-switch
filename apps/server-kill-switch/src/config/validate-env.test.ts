/**
 * validate-env tests — placeholder guard (K6, andler-ops#179)
 *
 * Verifies that startup validation rejects placeholder secrets
 * (change-me, <generate-with-…>, your-secret, example-…) instead of
 * silently booting with .env.example defaults.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { validateEnvironment } from './validate-env'

const SECRET_KEYS = [
	'BETTER_AUTH_SECRET',
	'KILL_SWITCH_AUTH_TOKEN',
	'KILL_SWITCH_API_KEY',
	'ADMIN_UI_API_KEY',
	'KILL_SWITCH_INTERNAL_KEY',
] as const

const STRONG_SECRETS: Record<(typeof SECRET_KEYS)[number], string> = {
	BETTER_AUTH_SECRET: `${'x'.repeat(64)}A1!`,
	KILL_SWITCH_AUTH_TOKEN: `aB3$${'x'.repeat(20)}`,
	KILL_SWITCH_API_KEY: `cD4#${'y'.repeat(20)}`,
	ADMIN_UI_API_KEY: `eF5@${'z'.repeat(36)}`,
	KILL_SWITCH_INTERNAL_KEY: `gH6%${'w'.repeat(36)}`,
}

function setEnv(overrides: Record<string, string>) {
	process.env.REDIS_URL = 'redis://localhost:6379'
	for (const key of SECRET_KEYS) {
		process.env[key] = STRONG_SECRETS[key]
	}
	for (const [k, v] of Object.entries(overrides)) {
		process.env[k] = v
	}
}

function clearEnv() {
	for (const key of SECRET_KEYS) {
		delete process.env[key]
	}
	delete process.env.REDIS_URL
}

describe('validateEnvironment — placeholder guard (K6)', () => {
	beforeEach(() => setEnv({}))
	afterEach(() => clearEnv())

	it('accepts strong generated secrets', () => {
		expect(() => validateEnvironment()).not.toThrow()
	})

	it.each(SECRET_KEYS)('rejects "change-me" placeholder for %s', (key) => {
		setEnv({ [key]: 'change-me' })
		expect(() => validateEnvironment()).toThrow(/placeholder/i)
	})

	it.each(SECRET_KEYS)('rejects "<generate-with-…>" placeholder for %s', (key) => {
		setEnv({ [key]: '<generate-with-openssl-rand-hex-32>' })
		expect(() => validateEnvironment()).toThrow(/placeholder/i)
	})

	it.each(SECRET_KEYS)('rejects "your-secret-here" placeholder for %s', (key) => {
		setEnv({ [key]: 'your-secret-here' })
		expect(() => validateEnvironment()).toThrow(/placeholder/i)
	})

	it('rejects a single placeholder among otherwise-strong secrets', () => {
		setEnv({ KILL_SWITCH_AUTH_TOKEN: 'change-this-token' })
		expect(() => validateEnvironment()).toThrow(/KILL_SWITCH_AUTH_TOKEN/)
	})

	it('still rejects short secrets (length guard intact)', () => {
		setEnv({ BETTER_AUTH_SECRET: 'short' })
		expect(() => validateEnvironment()).toThrow(/too short/i)
	})
})

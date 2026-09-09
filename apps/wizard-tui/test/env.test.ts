/**
 * Tests for lib/env.ts — .env writer (0600) + generateSecrets merge.
 */

import { afterEach, describe, expect, test } from 'bun:test'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateConfig } from '../src/lib/config'
import { generateSecrets, writeEnvFile } from '../src/lib/env'

const tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'wizard-env-'))
	tempDirs.push(dir)
	return dir
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const baseConfig = validateConfig({
	orgName: 'TestOrg',
	adminEmail: 'admin@test.org',
	motherUrl: 'http://localhost:3000',
	machineId: 'machine-test',
	machineName: 'test-node',
	machineHostname: 'test-node.local',
	redisUrl: 'redis://localhost:6379',
	webauthnRpId: 'test-node.local',
	webauthnOrigin: 'http://localhost:3001',
	ollamaBaseUrl: 'http://localhost:11434',
	verifyEnabled: true,
	verifyModel: 'qwen2.5:0.5b',
	installDir: '/tmp/alygn-test',
	serviceUser: 'tester',
	licenseAccepted: true,
})

describe('writeEnvFile', () => {
	test('writes the full spec §4 layout with mode 0600', async () => {
		const dir = await makeTempDir()
		const target = join(dir, '.env')
		const result = await writeEnvFile(baseConfig, target)

		expect(result.path).toBe(target)
		expect(result.mode).toBe(0o600)

		const text = await readFile(target, 'utf8')
		// Server block
		expect(text).toContain('KILL_SWITCH_ENV=production')
		expect(text).toContain('KILL_SWITCH_PORT=3000')
		expect(text).toContain('BETTER_AUTH_URL=http://localhost:3000')
		expect(text).toContain('ADMIN_EMAIL=admin@test.org')
		expect(text).toContain('REDIS_URL=redis://localhost:6379')
		expect(text).toContain('WEBAUTHN_RP_ID=test-node.local')
		expect(text).toContain('WEBAUTHN_ORIGIN=http://localhost:3001')
		expect(text).toContain('ALYGN_MACHINE_HOSTNAME=test-node.local')
		expect(text).toContain('ALYGN_MACHINE_NAME=test-node')
		expect(text).toContain('KILL_SWITCH_DISCOVERY_OLLAMA_BASE_URL=http://localhost:11434')
		expect(text).toContain('KILL_SWITCH_VERIFIER_BASE_URL=http://localhost:11434')
		expect(text).toContain('KILL_SWITCH_VERIFIER_MODEL=qwen2.5:0.5b')
		expect(text).toContain('KILL_SWITCH_VERIFY_ENABLED=true')
		expect(text).toContain('KILL_SWITCH_VERIFY_MODE=async')
		// Agent block
		expect(text).toContain('ALYGN_MOTHER_URL=http://localhost:3000')
		expect(text).toContain('ALYGN_MACHINE_ID=machine-test')
		expect(text).toContain('ALYGN_HEARTBEAT_INTERVAL_MS=30000')
		expect(text).toContain('OLLAMA_INTERCEPT_PORT=11434')
		expect(text).toContain('LOG_LEVEL=info')
	})

	test('preserves existing secret values and mirrors KILL_SWITCH_API_KEY', async () => {
		const dir = await makeTempDir()
		const target = join(dir, '.env')
		await writeFile(target, 'KILL_SWITCH_API_KEY=existing-secret-123456\n')

		await writeEnvFile(baseConfig, target)
		const text = await readFile(target, 'utf8')

		expect(text).toContain('KILL_SWITCH_API_KEY=existing-secret-123456')
		expect(text).toContain('ALYGN_AGENT_API_KEY=existing-secret-123456')
	})

	test('never writes secret values into the returned metadata', async () => {
		const dir = await makeTempDir()
		const target = join(dir, '.env')
		const result = await writeEnvFile(baseConfig, target)
		expect(JSON.stringify(result)).not.toContain('KILL_SWITCH')
	})

	test('verifyEnabled=false renders KILL_SWITCH_VERIFY_ENABLED=false', async () => {
		const dir = await makeTempDir()
		const target = join(dir, '.env')
		await writeEnvFile({ ...baseConfig, verifyEnabled: false }, target)
		const text = await readFile(target, 'utf8')
		expect(text).toContain('KILL_SWITCH_VERIFY_ENABLED=false')
	})

	test('file mode is 0600 even when the file pre-exists with looser mode', async () => {
		const dir = await makeTempDir()
		const target = join(dir, '.env')
		await writeFile(target, 'KILL_SWITCH_API_KEY=existing-secret-123456\n')
		await chmod(target, 0o644)
		const result = await writeEnvFile(baseConfig, target)
		expect(result.mode).toBe(0o600)
	})
})

describe('generateSecrets', () => {
	test('generates all six required keys into a fresh .env', async () => {
		const dir = await makeTempDir()
		const target = join(dir, '.env')
		await writeFile(target, 'KILL_SWITCH_ENV=production\n')

		const result = await generateSecrets(target)

		const expected = [
			'AUDIT_HMAC_KEY',
			'ADMIN_UI_API_KEY',
			'KILL_SWITCH_INTERNAL_KEY',
			'BETTER_AUTH_SECRET',
			'KILL_SWITCH_AUTH_TOKEN',
			'KILL_SWITCH_API_KEY',
		]
		expect(result.generated.sort()).toEqual(expected.sort())
		expect(result.skipped).toEqual([])

		const text = await readFile(target, 'utf8')
		for (const key of expected) {
			expect(text).toMatch(new RegExp(`^${key}=[0-9a-f]{64}$`, 'm'))
		}
	})

	test('is idempotent — existing keys are skipped, not overwritten', async () => {
		const dir = await makeTempDir()
		const target = join(dir, '.env')
		await writeFile(target, 'KILL_SWITCH_API_KEY=my-own-secret-1234567890\n')

		const first = await generateSecrets(target)
		expect(first.generated).toContain('BETTER_AUTH_SECRET')
		expect(first.skipped).toContain('KILL_SWITCH_API_KEY')

		const textAfterFirst = await readFile(target, 'utf8')
		expect(textAfterFirst).toContain('KILL_SWITCH_API_KEY=my-own-secret-1234567890')

		const second = await generateSecrets(target)
		expect(second.generated).toEqual([])
		expect(second.skipped.sort()).toEqual(
			[
				'AUDIT_HMAC_KEY',
				'ADMIN_UI_API_KEY',
				'KILL_SWITCH_INTERNAL_KEY',
				'BETTER_AUTH_SECRET',
				'KILL_SWITCH_AUTH_TOKEN',
				'KILL_SWITCH_API_KEY',
			].sort(),
		)
	})

	test('returns key names only — never values', async () => {
		const dir = await makeTempDir()
		const target = join(dir, '.env')
		const result = await generateSecrets(target)
		expect(JSON.stringify(result)).not.toMatch(/[0-9a-f]{64}/)
	})
})

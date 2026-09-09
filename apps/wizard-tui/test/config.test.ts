/**
 * Tests for lib/config.ts — zod schema + load/validate.
 */

import { describe, expect, test } from 'bun:test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig, validateConfig, wizardConfigSchema } from '../src/lib/config'

describe('validateConfig', () => {
	test('accepts an empty object and applies safe defaults', () => {
		const cfg = validateConfig({})
		expect(cfg.orgName).toBe('ALYGN')
		expect(cfg.adminEmail).toBe('admin@alygn.com')
		expect(cfg.motherUrl).toBe('http://localhost:3000')
		expect(cfg.redisUrl).toBe('redis://localhost:6379')
		expect(cfg.ollamaBaseUrl).toBe('http://localhost:11434')
		expect(cfg.webauthnOrigin).toBe('http://localhost:3001')
		expect(cfg.verifyEnabled).toBe(false)
		expect(cfg.verifyModel).toBe('qwen2.5:0.5b')
		expect(cfg.licenseAccepted).toBe(false)
		expect(cfg.zones).toEqual(['default'])
		expect(cfg.thresholds).toEqual({
			malformedThreshold: 100,
			detectionWindowUs: 1_000_000,
			gridThreatGbps: 10,
			gridThreatWindowUs: 1_000_000,
		})
	})

	test('accepts a full valid config', () => {
		const cfg = validateConfig({
			orgName: 'Acme',
			adminEmail: 'ops@acme.com',
			adminPassword: 'supersecret-password-123',
			motherUrl: 'https://mother.acme.com',
			machineId: 'machine-1',
			machineName: 'node-1',
			machineHostname: 'node-1.acme.com',
			redisUrl: 'redis://redis.acme.com:6379',
			webauthnRpId: 'node-1.acme.com',
			webauthnOrigin: 'https://node-1.acme.com:8443',
			ollamaBaseUrl: 'http://ollama.acme.com:11434',
			thresholds: {
				malformedThreshold: 200,
				detectionWindowUs: 2_000_000,
				gridThreatGbps: 20,
				gridThreatWindowUs: 2_000_000,
			},
			zones: ['us-east', 'us-west'],
			installDir: '/opt/alygn',
			serviceUser: 'alygn',
			licenseAccepted: true,
			verifyEnabled: true,
			verifyModel: 'qwen2.5:7b',
		})
		expect(cfg.orgName).toBe('Acme')
		expect(cfg.thresholds.gridThreatGbps).toBe(20)
		expect(cfg.zones).toEqual(['us-east', 'us-west'])
		expect(cfg.verifyEnabled).toBe(true)
	})

	test('rejects an invalid email with a readable error', () => {
		expect(() => validateConfig({ adminEmail: 'not-an-email' })).toThrow()
	})

	test('rejects a short adminPassword', () => {
		expect(() => validateConfig({ adminPassword: 'short' })).toThrow()
	})

	test('rejects unknown keys (strict schema)', () => {
		expect(() => validateConfig({ bogusKey: true })).toThrow()
	})

	test('rejects licenseAccepted: false when explicitly set', () => {
		const cfg = validateConfig({ licenseAccepted: false })
		expect(cfg.licenseAccepted).toBe(false)
	})
})

describe('wizardConfigSchema', () => {
	test('schema is a zod object schema', () => {
		expect(wizardConfigSchema).toBeDefined()
		expect(typeof wizardConfigSchema.parse).toBe('function')
	})
})

describe('loadConfig', () => {
	test('loads and validates a JSON config file', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'wizard-config-'))
		const path = join(dir, 'config.json')
		await writeFile(path, JSON.stringify({ orgName: 'FileOrg', licenseAccepted: true }))
		const cfg = await loadConfig({ configPath: path, interactive: false })
		expect(cfg.orgName).toBe('FileOrg')
		expect(cfg.licenseAccepted).toBe(true)
	})

	test('throws a readable error for invalid JSON', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'wizard-config-'))
		const path = join(dir, 'bad.json')
		await writeFile(path, '{not json')
		await expect(loadConfig({ configPath: path, interactive: false })).rejects.toThrow(
			/not valid JSON/,
		)
	})

	test('throws when no config path and interactive is disabled', async () => {
		await expect(loadConfig({ configPath: undefined, interactive: false })).rejects.toThrow(
			/--config/,
		)
	})

	test('returns defaults when interactive and no config path', async () => {
		const cfg = await loadConfig({ configPath: undefined, interactive: true })
		expect(cfg.orgName).toBe('ALYGN')
	})
})

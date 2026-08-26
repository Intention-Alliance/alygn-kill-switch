/**
 * verifier-config tests — ADR-2026-08-23 inference verification layer
 *
 * Verifies that the verification config schema loads with correct defaults,
 * that environment variable overrides are applied, and that validation
 * catches misconfigurations when verification is enabled.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { loadConfig, resetConfig } from '../../../config'
import { VerificationConfigSchema } from '../../../config/schema'
import {
	validateVerifierConfig,
	validateVerifierReachability,
} from '../../../config/validate-env'

// ─── Helpers ─────────────────────────────────────────────────────

const VERIFIER_ENV_KEYS = [
	'KILL_SWITCH_VERIFIER_MODEL',
	'KILL_SWITCH_VERIFIER_BASE_URL',
	'KILL_SWITCH_VERIFIER_TIMEOUT_MS',
	'KILL_SWITCH_VERIFY_ENABLED',
	'KILL_SWITCH_VERIFY_MODE',
	'KILL_SWITCH_VERIFIER_SYSTEM_PROMPT_PATH',
]

function clearVerifierEnv() {
	for (const key of VERIFIER_ENV_KEYS) {
		delete process.env[key]
	}
}

function setVerifierEnv(overrides: Record<string, string>) {
	clearVerifierEnv()
	for (const [k, v] of Object.entries(overrides)) {
		process.env[k] = v
	}
}

// ─── Schema defaults ─────────────────────────────────────────────

describe('VerificationConfigSchema — defaults', () => {
	it('applies spec §c.2 defaults', () => {
		const parsed = VerificationConfigSchema.parse({})
		expect(parsed.verifierModel).toBe('qwen2.5:0.5b')
		expect(parsed.verifierBaseUrl).toBe('http://localhost:11434')
		expect(parsed.verifierTimeoutMs).toBe(500)
		expect(parsed.verifyEnabled).toBe(false)
		expect(parsed.verifyMode).toBe('async')
		expect(parsed.verifierSystemPromptPath).toBe('docs/specs/verifier-system-prompt.md')
	})

	it('rejects an invalid verifyMode', () => {
		expect(() => VerificationConfigSchema.parse({ verifyMode: 'bogus' })).toThrow()
	})

	it('rejects a non-URL verifierBaseUrl', () => {
		expect(() => VerificationConfigSchema.parse({ verifierBaseUrl: 'not-a-url' })).toThrow()
	})

	it('rejects a non-integer verifierTimeoutMs', () => {
		expect(() => VerificationConfigSchema.parse({ verifierTimeoutMs: 12.5 })).toThrow()
	})
})

// ─── Config loading ──────────────────────────────────────────────

describe('loadConfig — verification section', () => {
	beforeEach(() => {
		clearVerifierEnv()
		resetConfig()
	})
	afterEach(() => {
		clearVerifierEnv()
		resetConfig()
	})

	it('getConfig().verification returns defaults when no env overrides', () => {
		const config = loadConfig('development')
		expect(config.verification.verifierModel).toBe('qwen2.5:0.5b')
		expect(config.verification.verifierBaseUrl).toBe('http://localhost:11434')
		expect(config.verification.verifierTimeoutMs).toBe(500)
		expect(config.verification.verifyMode).toBe('async')
		expect(config.verification.verifierSystemPromptPath).toBe('docs/specs/verifier-system-prompt.md')
	})

	it('development disables verification by default (P2-5: off until verifier confirmed reachable)', () => {
		const config = loadConfig('development')
		expect(config.verification.verifyEnabled).toBe(false)
	})

	it('production enables verification by default (verifier confirmed reachable)', () => {
		const config = loadConfig('production')
		expect(config.verification.verifyEnabled).toBe(true)
	})

	it('staging disables verification by default (P2-5: off until verifier confirmed reachable)', () => {
		const config = loadConfig('staging')
		expect(config.verification.verifyEnabled).toBe(false)
	})

	it('applies env var overrides', () => {
		setVerifierEnv({
			KILL_SWITCH_VERIFIER_MODEL: 'tinyllama',
			KILL_SWITCH_VERIFIER_BASE_URL: 'http://ollama:11434',
			KILL_SWITCH_VERIFIER_TIMEOUT_MS: '750',
			KILL_SWITCH_VERIFY_ENABLED: 'true',
			KILL_SWITCH_VERIFY_MODE: 'sync',
			KILL_SWITCH_VERIFIER_SYSTEM_PROMPT_PATH: '/tmp/prompt.md',
		})
		const config = loadConfig('production')
		expect(config.verification.verifierModel).toBe('tinyllama')
		expect(config.verification.verifierBaseUrl).toBe('http://ollama:11434')
		expect(config.verification.verifierTimeoutMs).toBe(750)
		expect(config.verification.verifyEnabled).toBe(true)
		expect(config.verification.verifyMode).toBe('sync')
		expect(config.verification.verifierSystemPromptPath).toBe('/tmp/prompt.md')
	})

	it('parses KILL_SWITCH_VERIFY_ENABLED=false as boolean false', () => {
		setVerifierEnv({ KILL_SWITCH_VERIFY_ENABLED: 'false' })
		const config = loadConfig('development')
		expect(config.verification.verifyEnabled).toBe(false)
	})

	it('env overrides take precedence over environment defaults', () => {
		// development defaults verifyEnabled=true, but env forces it off
		setVerifierEnv({ KILL_SWITCH_VERIFY_ENABLED: 'false' })
		const config = loadConfig('development')
		expect(config.verification.verifyEnabled).toBe(false)
	})
})

// ─── Validation ──────────────────────────────────────────────────

describe('validateVerifierConfig — misconfiguration detection', () => {
	it('is a no-op when verification is disabled', () => {
		expect(() =>
			validateVerifierConfig({
				verifierModel: '',
				verifierBaseUrl: 'not-a-url',
				verifierTimeoutMs: 500,
				verifyEnabled: false,
				verifyMode: 'async',
				verifierSystemPromptPath: 'docs/specs/verifier-system-prompt.md',
			}),
		).not.toThrow()
	})

	it('throws when verifierModel is empty and verification is enabled', () => {
		expect(() =>
			validateVerifierConfig({
				verifierModel: '',
				verifierBaseUrl: 'http://localhost:11434',
				verifierTimeoutMs: 500,
				verifyEnabled: true,
				verifyMode: 'async',
				verifierSystemPromptPath: 'docs/specs/verifier-system-prompt.md',
			}),
		).toThrow(/verifierModel must be non-empty/)
	})

	it('throws when verifierBaseUrl is not a valid URL and verification is enabled', () => {
		expect(() =>
			validateVerifierConfig({
				verifierModel: 'qwen2.5:0.5b',
				verifierBaseUrl: 'not-a-url',
				verifierTimeoutMs: 500,
				verifyEnabled: true,
				verifyMode: 'async',
				verifierSystemPromptPath: 'docs/specs/verifier-system-prompt.md',
			}),
		).toThrow(/not a valid URL/)
	})

	it('throws when verifierBaseUrl uses a non-http protocol', () => {
		expect(() =>
			validateVerifierConfig({
				verifierModel: 'qwen2.5:0.5b',
				verifierBaseUrl: 'ftp://localhost:11434',
				verifierTimeoutMs: 500,
				verifyEnabled: true,
				verifyMode: 'async',
				verifierSystemPromptPath: 'docs/specs/verifier-system-prompt.md',
			}),
		).toThrow(/must use http\(s\)/)
	})

	it('accepts a valid config when verification is enabled', () => {
		expect(() =>
			validateVerifierConfig({
				verifierModel: 'qwen2.5:0.5b',
				verifierBaseUrl: 'http://localhost:11434',
				verifierTimeoutMs: 500,
				verifyEnabled: true,
				verifyMode: 'async',
				verifierSystemPromptPath: 'docs/specs/verifier-system-prompt.md',
			}),
		).not.toThrow()
	})
})

describe('validateVerifierReachability', () => {
	it('returns true immediately when verification is disabled', async () => {
		const ok = await validateVerifierReachability({
			verifierModel: 'qwen2.5:0.5b',
			verifierBaseUrl: 'http://localhost:11434',
			verifierTimeoutMs: 500,
			verifyEnabled: false,
			verifyMode: 'async',
			verifierSystemPromptPath: 'docs/specs/verifier-system-prompt.md',
		})
		expect(ok).toBe(true)
	})

	it('returns false for an unreachable endpoint when verification is enabled', async () => {
		const ok = await validateVerifierReachability(
			{
				verifierModel: 'qwen2.5:0.5b',
				verifierBaseUrl: 'http://127.0.0.1:1',
				verifierTimeoutMs: 500,
				verifyEnabled: true,
				verifyMode: 'async',
				verifierSystemPromptPath: 'docs/specs/verifier-system-prompt.md',
			},
			500,
		)
		expect(ok).toBe(false)
	})
})

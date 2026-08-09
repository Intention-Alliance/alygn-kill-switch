/**
 * Provider Adapters — Unit Tests (ADR-135 §1, §4)
 *
 * Each adapter (Ollama, Hugging Face, LlamaIndex, vLLM, OpenAI-compatible)
 * must implement the uniform DiscoveryProvider contract: detect, listModels,
 * health. Tests use a local mock HTTP server so no real inference stack is
 * required.
 */

import { afterAll, describe, expect, it } from 'bun:test'
import { HuggingFaceDiscoveryProvider } from '../providers/huggingface'
import { LlamaIndexDiscoveryProvider } from '../providers/llamaindex'
import { OllamaDiscoveryProvider } from '../providers/ollama'
import { OpenAiCompatibleDiscoveryProvider } from '../providers/openai-compatible'
import { ProviderRegistry } from '../providers/registry'
import { VllmDiscoveryProvider } from '../providers/vllm'

// ─── Mock HTTP server ───────────────────────────────────────────

const server = Bun.serve({
	port: 0,
	fetch(request) {
		const url = new URL(request.url)
		if (url.pathname === '/api/tags') {
			return Response.json({
				models: [
					{
						name: 'llama3:8b',
						size: 4691249611,
						details: { family: 'llama', quantization: 'Q4_K_M' },
					},
					{
						name: 'qwen2.5:7b',
						size: 4691249611,
						details: { family: 'qwen', quantization: 'Q4_K_M' },
					},
				],
			})
		}
		if (url.pathname === '/v1/models') {
			return Response.json({
				data: [
					{
						id: 'meta-llama/Llama-3.1-8B-Instruct',
						object: 'model',
						owned_by: 'meta',
					},
					{ id: 'Qwen/Qwen2.5-7B-Instruct', object: 'model', owned_by: 'qwen' },
				],
			})
		}
		if (url.pathname === '/health') {
			return Response.json({ status: 'ok' })
		}
		return new Response('Not Found', { status: 404 })
	},
})

const baseUrl = `http://127.0.0.1:${server.port}`

afterAll(() => {
	server.stop(true)
})

// ─── Contract conformance ───────────────────────────────────────

describe('DiscoveryProvider contract', () => {
	it('every adapter exposes id, detect, listModels, health', () => {
		const adapters = [
			new OllamaDiscoveryProvider({ baseUrl }),
			new VllmDiscoveryProvider({ baseUrl }),
			new OpenAiCompatibleDiscoveryProvider({ baseUrl }),
			new HuggingFaceDiscoveryProvider({
				tgiUrl: baseUrl,
				cacheDir: '/nonexistent-cache',
			}),
			new LlamaIndexDiscoveryProvider({
				serverUrl: baseUrl,
				searchDirs: ['/nonexistent-dir'],
			}),
		]
		for (const adapter of adapters) {
			expect(typeof adapter.id).toBe('string')
			expect(typeof adapter.detect).toBe('function')
			expect(typeof adapter.listModels).toBe('function')
			expect(typeof adapter.health).toBe('function')
		}
	})
})

// ─── Ollama ─────────────────────────────────────────────────────

describe('OllamaDiscoveryProvider', () => {
	it('detects an Ollama instance via /api/tags', async () => {
		const adapter = new OllamaDiscoveryProvider({ baseUrl })
		const info = await adapter.detect()
		expect(info).not.toBeNull()
		expect(info!.id).toBe('ollama')
		expect(info!.baseUrl).toBe(baseUrl)
	})

	it('returns null when Ollama is absent', async () => {
		const adapter = new OllamaDiscoveryProvider({
			baseUrl: 'http://127.0.0.1:1',
		})
		const info = await adapter.detect()
		expect(info).toBeNull()
	})

	it('lists models with size and quantization', async () => {
		const adapter = new OllamaDiscoveryProvider({ baseUrl })
		const models = await adapter.listModels()
		expect(models.length).toBe(2)
		expect(models[0]).toMatchObject({
			providerId: 'ollama',
			name: 'llama3:8b',
			sizeBytes: 4691249611,
			quantization: 'Q4_K_M',
			family: 'llama',
			served: true,
		})
	})

	it('reports healthy when the endpoint responds', async () => {
		const adapter = new OllamaDiscoveryProvider({ baseUrl })
		const health = await adapter.health()
		expect(health.healthy).toBe(true)
		expect(health.error).toBeNull()
		expect(typeof health.latencyMs).toBe('number')
	})

	it('reports unhealthy when the endpoint is down', async () => {
		const adapter = new OllamaDiscoveryProvider({
			baseUrl: 'http://127.0.0.1:1',
		})
		const health = await adapter.health()
		expect(health.healthy).toBe(false)
		expect(health.error).not.toBeNull()
	})
})

// ─── vLLM ───────────────────────────────────────────────────────

describe('VllmDiscoveryProvider', () => {
	it('detects a vLLM server via /v1/models', async () => {
		const adapter = new VllmDiscoveryProvider({ baseUrl })
		const info = await adapter.detect()
		expect(info).not.toBeNull()
		expect(info!.id).toBe('vllm')
	})

	it('lists served models', async () => {
		const adapter = new VllmDiscoveryProvider({ baseUrl })
		const models = await adapter.listModels()
		expect(models.length).toBe(2)
		expect(models[0]).toMatchObject({
			providerId: 'vllm',
			id: 'meta-llama/Llama-3.1-8B-Instruct',
			served: true,
		})
	})

	it('reports healthy when serving', async () => {
		const adapter = new VllmDiscoveryProvider({ baseUrl })
		const health = await adapter.health()
		expect(health.healthy).toBe(true)
	})
})

// ─── OpenAI-compatible ──────────────────────────────────────────

describe('OpenAiCompatibleDiscoveryProvider', () => {
	it('detects an OpenAI-compatible gateway', async () => {
		const adapter = new OpenAiCompatibleDiscoveryProvider({ baseUrl })
		const info = await adapter.detect()
		expect(info).not.toBeNull()
		expect(info!.id).toBe('openai-compatible')
	})

	it('lists models from /v1/models data array', async () => {
		const adapter = new OpenAiCompatibleDiscoveryProvider({ baseUrl })
		const models = await adapter.listModels()
		expect(models.length).toBe(2)
		expect(models.every((m) => m.providerId === 'openai-compatible')).toBe(true)
	})

	it('returns empty list when gateway is down', async () => {
		const adapter = new OpenAiCompatibleDiscoveryProvider({
			baseUrl: 'http://127.0.0.1:1',
		})
		const models = await adapter.listModels()
		expect(models).toEqual([])
	})
})

// ─── Hugging Face ───────────────────────────────────────────────

describe('HuggingFaceDiscoveryProvider', () => {
	it('detects via local TGI endpoint when no cache exists', async () => {
		const adapter = new HuggingFaceDiscoveryProvider({
			tgiUrl: baseUrl,
			cacheDir: '/nonexistent-cache',
		})
		const info = await adapter.detect()
		expect(info).not.toBeNull()
		expect(info!.id).toBe('huggingface')
	})

	it('returns null when neither cache nor TGI is present', async () => {
		const adapter = new HuggingFaceDiscoveryProvider({
			tgiUrl: 'http://127.0.0.1:1',
			cacheDir: '/nonexistent-cache',
		})
		const info = await adapter.detect()
		expect(info).toBeNull()
	})

	it('lists served models from TGI', async () => {
		const adapter = new HuggingFaceDiscoveryProvider({
			tgiUrl: baseUrl,
			cacheDir: '/nonexistent-cache',
		})
		const models = await adapter.listModels()
		expect(models.length).toBe(2)
		expect(models[0].providerId).toBe('huggingface')
		expect(models[0].served).toBe(true)
	})
})

// ─── LlamaIndex ─────────────────────────────────────────────────

describe('LlamaIndexDiscoveryProvider', () => {
	it('detects via local server /health when no index artifacts exist', async () => {
		const adapter = new LlamaIndexDiscoveryProvider({
			serverUrl: baseUrl,
			searchDirs: ['/nonexistent-dir'],
		})
		const info = await adapter.detect()
		expect(info).not.toBeNull()
		expect(info!.id).toBe('llamaindex')
	})

	it('returns null when neither artifacts nor server are present', async () => {
		const adapter = new LlamaIndexDiscoveryProvider({
			serverUrl: 'http://127.0.0.1:1',
			searchDirs: ['/nonexistent-dir'],
		})
		const info = await adapter.detect()
		expect(info).toBeNull()
	})

	it('reports healthy when the server responds', async () => {
		const adapter = new LlamaIndexDiscoveryProvider({
			serverUrl: baseUrl,
			searchDirs: ['/nonexistent-dir'],
		})
		const health = await adapter.health()
		expect(health.healthy).toBe(true)
	})
})

// ─── Registry ───────────────────────────────────────────────────

describe('ProviderRegistry', () => {
	it('discovers all providers that respond affirmatively', async () => {
		const registry = new ProviderRegistry({
			ollamaBaseUrl: baseUrl,
			vllmBaseUrl: baseUrl,
			huggingFaceTgiUrl: baseUrl,
			llamaIndexServerUrl: baseUrl,
		})
		const results = await registry.discoverProviders()
		// ollama + vllm + huggingface + llamaindex all point at the mock server
		expect(results.length).toBeGreaterThanOrEqual(4)
		const ids = results.map((r) => r.provider.id)
		expect(ids).toContain('ollama')
		expect(ids).toContain('vllm')
		expect(ids).toContain('huggingface')
		expect(ids).toContain('llamaindex')
	})

	it('returns empty when nothing responds', async () => {
		const registry = new ProviderRegistry({
			ollamaBaseUrl: 'http://127.0.0.1:1',
			vllmBaseUrl: 'http://127.0.0.1:1',
			huggingFaceTgiUrl: 'http://127.0.0.1:1',
			llamaIndexServerUrl: 'http://127.0.0.1:1',
		})
		const results = await registry.discoverProviders()
		expect(results).toEqual([])
	})

	it('probes a single provider by id', async () => {
		const registry = new ProviderRegistry({ ollamaBaseUrl: baseUrl })
		const result = await registry.probeProvider('ollama')
		expect(result).not.toBeNull()
		expect(result!.provider.id).toBe('ollama')
		expect(result!.models.length).toBe(2)
	})

	it('returns null for unknown provider id', async () => {
		const registry = new ProviderRegistry({ ollamaBaseUrl: baseUrl })
		const result = await registry.probeProvider('nonexistent' as never)
		expect(result).toBeNull()
	})
})

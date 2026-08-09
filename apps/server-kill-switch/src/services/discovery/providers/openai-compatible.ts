/**
 * OpenAI-Compatible Provider Adapter (ADR-135)
 *
 * Generic adapter for any OpenAI-compatible inference gateway (LM Studio,
 * llama.cpp server, OpenAI/Anthropic-compatible proxies, external
 * gateways). Enumerates models via GET /v1/models against a configured
 * base URL, with optional Bearer auth.
 *
 * AI-agnostic contract: implements DiscoveryProvider. This is the
 * catch-all adapter — it is probed LAST so vendor-specific adapters
 * (Ollama, vLLM) win when they match.
 */

import type {
	DiscoveryProvider,
	ModelInfo,
	ProviderHealth,
	ProviderInfo,
} from '@align/shared-types'
import { boundedFetch, parseArrayField } from '../http'

interface OpenAiCompatibleAdapterParams {
	baseUrl: string
	apiKey?: string
}

interface OpenAiModelEntry {
	id?: string
	object?: string
	owned_by?: string
}

function normalizeModelEntry(entry: OpenAiModelEntry): ModelInfo | null {
	const id = entry.id
	if (!id) return null
	return {
		id,
		name: id,
		providerId: 'openai-compatible',
		sizeBytes: null,
		quantization: null,
		family: entry.owned_by ?? null,
		served: true,
	}
}

export class OpenAiCompatibleDiscoveryProvider implements DiscoveryProvider {
	readonly id = 'openai-compatible' as const
	private readonly baseUrl: string
	private readonly apiKey: string | undefined

	constructor({ baseUrl, apiKey }: OpenAiCompatibleAdapterParams) {
		this.baseUrl = baseUrl.replace(/\/$/, '')
		this.apiKey = apiKey
	}

	async detect(): Promise<ProviderInfo | null> {
		const result = await boundedFetch({
			url: `${this.baseUrl}/v1/models`,
			headers: this.apiKey
				? { Authorization: `Bearer ${this.apiKey}` }
				: undefined,
		})
		if (!result.ok) return null
		return {
			id: this.id,
			name: 'OpenAI-Compatible',
			version: null,
			baseUrl: this.baseUrl,
			detectedAt: new Date().toISOString(),
		}
	}

	async listModels(): Promise<ModelInfo[]> {
		const result = await boundedFetch({
			url: `${this.baseUrl}/v1/models`,
			headers: this.apiKey
				? { Authorization: `Bearer ${this.apiKey}` }
				: undefined,
		})
		if (!result.ok) return []
		const entries = parseArrayField(result.body, 'data')
		return entries
			.map((entry) => normalizeModelEntry(entry as OpenAiModelEntry))
			.filter((model): model is ModelInfo => model !== null)
	}

	async health(): Promise<ProviderHealth> {
		const result = await boundedFetch({
			url: `${this.baseUrl}/v1/models`,
			headers: this.apiKey
				? { Authorization: `Bearer ${this.apiKey}` }
				: undefined,
		})
		return {
			healthy: result.ok,
			latencyMs: result.latencyMs,
			error: result.ok
				? null
				: `openai-compatible probe failed (status ${result.status})`,
			checkedAt: new Date().toISOString(),
		}
	}
}

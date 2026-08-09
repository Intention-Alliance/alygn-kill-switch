/**
 * vLLM Provider Adapter (ADR-135)
 *
 * Detects a local vLLM inference server and enumerates served models via
 * GET /v1/models (OpenAI-compatible surface). Health is probed via the
 * same endpoint — a 200 implies the engine is serving.
 *
 * AI-agnostic contract: implements DiscoveryProvider.
 */

import type {
	DiscoveryProvider,
	ModelInfo,
	ProviderHealth,
	ProviderInfo,
} from '@align/shared-types'
import { boundedFetch, parseArrayField } from '../http'

const DEFAULT_BASE_URL = 'http://127.0.0.1:8000'

interface VllmAdapterParams {
	baseUrl?: string
}

interface VllmModelEntry {
	id?: string
	object?: string
	created?: number
	owned_by?: string
}

function normalizeModelEntry(entry: VllmModelEntry): ModelInfo | null {
	const id = entry.id
	if (!id) return null
	return {
		id,
		name: id,
		providerId: 'vllm',
		sizeBytes: null, // /v1/models does not expose sizes
		quantization: null,
		family: entry.owned_by ?? null,
		served: true,
	}
}

export class VllmDiscoveryProvider implements DiscoveryProvider {
	readonly id = 'vllm' as const
	private readonly baseUrl: string

	constructor({ baseUrl = DEFAULT_BASE_URL }: VllmAdapterParams = {}) {
		this.baseUrl = baseUrl.replace(/\/$/, '')
	}

	async detect(): Promise<ProviderInfo | null> {
		const result = await boundedFetch({ url: `${this.baseUrl}/v1/models` })
		if (!result.ok) return null
		return {
			id: this.id,
			name: 'vLLM',
			version: null,
			baseUrl: this.baseUrl,
			detectedAt: new Date().toISOString(),
		}
	}

	async listModels(): Promise<ModelInfo[]> {
		const result = await boundedFetch({ url: `${this.baseUrl}/v1/models` })
		if (!result.ok) return []
		const entries = parseArrayField(result.body, 'data')
		return entries
			.map((entry) => normalizeModelEntry(entry as VllmModelEntry))
			.filter((model): model is ModelInfo => model !== null)
	}

	async health(): Promise<ProviderHealth> {
		const result = await boundedFetch({ url: `${this.baseUrl}/v1/models` })
		return {
			healthy: result.ok,
			latencyMs: result.latencyMs,
			error: result.ok ? null : `vllm probe failed (status ${result.status})`,
			checkedAt: new Date().toISOString(),
		}
	}
}

/**
 * Ollama Provider Adapter (ADR-135)
 *
 * Detects a local Ollama instance and enumerates installed models via
 * GET /api/tags. Health is probed via GET /api/tags (Ollama has no
 * dedicated health endpoint; a 200 on tags implies the server is up).
 *
 * AI-agnostic contract: implements DiscoveryProvider so the kill switch
 * treats Ollama identically to vLLM, Hugging Face, etc.
 */

import type {
	DiscoveryProvider,
	ModelInfo,
	ProviderHealth,
	ProviderInfo,
} from '@align/shared-types'
import { boundedFetch, parseArrayField } from '../http'

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434'

interface OllamaAdapterParams {
	baseUrl?: string
}

interface OllamaModelEntry {
	name?: string
	model?: string
	size?: number
	quantization?: string
	family?: string
	details?: { family?: string; quantization?: string }
}

function normalizeModelEntry(entry: OllamaModelEntry): ModelInfo | null {
	const name = entry.name ?? entry.model
	if (!name) return null
	const details = entry.details ?? {}
	return {
		id: name,
		name,
		providerId: 'ollama',
		sizeBytes: typeof entry.size === 'number' ? entry.size : null,
		quantization: entry.quantization ?? details.quantization ?? null,
		family: entry.family ?? details.family ?? null,
		served: true, // /api/tags lists models the server can serve
	}
}

export class OllamaDiscoveryProvider implements DiscoveryProvider {
	readonly id = 'ollama' as const
	private readonly baseUrl: string

	constructor({ baseUrl = DEFAULT_BASE_URL }: OllamaAdapterParams = {}) {
		this.baseUrl = baseUrl.replace(/\/$/, '')
	}

	async detect(): Promise<ProviderInfo | null> {
		const result = await boundedFetch({ url: `${this.baseUrl}/api/tags` })
		if (!result.ok) return null
		return {
			id: this.id,
			name: 'Ollama',
			version: null,
			baseUrl: this.baseUrl,
			detectedAt: new Date().toISOString(),
		}
	}

	async listModels(): Promise<ModelInfo[]> {
		const result = await boundedFetch({ url: `${this.baseUrl}/api/tags` })
		if (!result.ok) return []
		const entries = parseArrayField(result.body, 'models')
		return entries
			.map((entry) => normalizeModelEntry(entry as OllamaModelEntry))
			.filter((model): model is ModelInfo => model !== null)
	}

	async health(): Promise<ProviderHealth> {
		const result = await boundedFetch({ url: `${this.baseUrl}/api/tags` })
		return {
			healthy: result.ok,
			latencyMs: result.latencyMs,
			error: result.ok ? null : `ollama probe failed (status ${result.status})`,
			checkedAt: new Date().toISOString(),
		}
	}
}

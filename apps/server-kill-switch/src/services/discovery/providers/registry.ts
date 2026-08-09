/**
 * Provider Registry (ADR-135 §1, §4)
 *
 * Probes every known provider adapter in priority order. Vendor-specific
 * adapters (Ollama, vLLM) are probed before the generic OpenAI-compatible
 * catch-all so specific matches win. A machine may host multiple
 * providers — all detected ones are returned.
 *
 * The registry is the single entry point for per-machine model &
 * provider detection: `discoverProviders()` returns what is actually
 * present, feeding the Flag Management surface (ADR-137).
 */

import type {
	DiscoveryProvider,
	ModelInfo,
	ProviderHealth,
	ProviderId,
	ProviderInfo,
} from '@align/shared-types'
import { HuggingFaceDiscoveryProvider } from './huggingface'
import { LlamaIndexDiscoveryProvider } from './llamaindex'
import { OllamaDiscoveryProvider } from './ollama'
import { OpenAiCompatibleDiscoveryProvider } from './openai-compatible'
import { VllmDiscoveryProvider } from './vllm'

export interface ProviderRegistryParams {
	ollamaBaseUrl?: string
	vllmBaseUrl?: string
	huggingFaceCacheDir?: string
	huggingFaceTgiUrl?: string
	llamaIndexSearchDirs?: string[]
	llamaIndexServerUrl?: string
	openAiCompatibleBaseUrls?: string[]
	openAiCompatibleApiKey?: string
}

export interface ProviderProbeResult {
	provider: ProviderInfo
	models: ModelInfo[]
	health: ProviderHealth
}

export class ProviderRegistry {
	private readonly adapters: DiscoveryProvider[]

	constructor(params: ProviderRegistryParams = {}) {
		const adapters: DiscoveryProvider[] = [
			new OllamaDiscoveryProvider({ baseUrl: params.ollamaBaseUrl }),
			new HuggingFaceDiscoveryProvider({
				cacheDir: params.huggingFaceCacheDir,
				tgiUrl: params.huggingFaceTgiUrl,
			}),
			new LlamaIndexDiscoveryProvider({
				searchDirs: params.llamaIndexSearchDirs,
				serverUrl: params.llamaIndexServerUrl,
			}),
			new VllmDiscoveryProvider({ baseUrl: params.vllmBaseUrl }),
		]

		// Generic OpenAI-compatible gateways — probed last (catch-all)
		const openAiUrls = params.openAiCompatibleBaseUrls ?? []
		for (const baseUrl of openAiUrls) {
			adapters.push(
				new OpenAiCompatibleDiscoveryProvider({
					baseUrl,
					apiKey: params.openAiCompatibleApiKey,
				}),
			)
		}

		this.adapters = adapters
	}

	/**
	 * Probe all adapters; return every provider that responds affirmatively.
	 * Detection is bounded per-adapter (1.5s timeout) so a dead endpoint
	 * never stalls the sweep.
	 */
	async discoverProviders(): Promise<ProviderProbeResult[]> {
		const results: ProviderProbeResult[] = []
		for (const adapter of this.adapters) {
			const provider = await adapter.detect()
			if (provider === null) continue
			const [models, health] = await Promise.all([
				adapter.listModels(),
				adapter.health(),
			])
			results.push({ provider, models, health })
		}
		return results
	}

	/**
	 * Probe a single adapter by id (used for targeted re-detection).
	 */
	async probeProvider(
		providerId: ProviderId,
	): Promise<ProviderProbeResult | null> {
		const adapter = this.adapters.find(
			(candidate) => candidate.id === providerId,
		)
		if (!adapter) return null
		const provider = await adapter.detect()
		if (provider === null) return null
		const [models, health] = await Promise.all([
			adapter.listModels(),
			adapter.health(),
		])
		return { provider, models, health }
	}
}

/**
 * LlamaIndex Provider Adapter (ADR-135)
 *
 * LlamaIndex is a framework, not a server — there is no canonical
 * network API. Detection is filesystem-first: look for LlamaIndex
 * storage/index artifacts (storage/, index_store.json, docstore.json)
 * in common project locations, plus an optional local FastAPI/Flask
 * endpoint that serves a LlamaIndex app (default port 8001).
 *
 * AI-agnostic contract: implements DiscoveryProvider.
 */

import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type {
	DiscoveryProvider,
	ModelInfo,
	ProviderHealth,
	ProviderInfo,
} from '@align/shared-types'
import { boundedFetch } from '../http'

const DEFAULT_SERVER_URL = 'http://127.0.0.1:8001'

interface LlamaIndexAdapterParams {
	searchDirs?: string[]
	serverUrl?: string
}

const INDEX_ARTIFACTS = [
	'index_store.json',
	'docstore.json',
	'storage',
	'vector_store.json',
] as const

function findIndexArtifacts(searchDirs: string[]): string[] {
	const found: string[] = []
	for (const dir of searchDirs) {
		if (!existsSync(dir)) continue
		try {
			const entries = readdirSync(dir)
			for (const artifact of INDEX_ARTIFACTS) {
				if (entries.includes(artifact)) {
					found.push(join(dir, artifact))
				}
			}
		} catch {
			// unreadable directory — skip
		}
	}
	return found
}

export class LlamaIndexDiscoveryProvider implements DiscoveryProvider {
	readonly id = 'llamaindex' as const
	private readonly searchDirs: string[]
	private readonly serverUrl: string

	constructor({
		searchDirs,
		serverUrl = DEFAULT_SERVER_URL,
	}: LlamaIndexAdapterParams = {}) {
		this.searchDirs = searchDirs ?? [
			join(homedir(), 'llamaindex'),
			join(homedir(), 'indexes'),
		]
		this.serverUrl = serverUrl.replace(/\/$/, '')
	}

	async detect(): Promise<ProviderInfo | null> {
		const artifacts = findIndexArtifacts(this.searchDirs)
		if (artifacts.length > 0) {
			return {
				id: this.id,
				name: 'LlamaIndex',
				version: null,
				baseUrl: null,
				detectedAt: new Date().toISOString(),
			}
		}
		// Fallback: a local server wrapping a LlamaIndex app
		const result = await boundedFetch({ url: `${this.serverUrl}/health` })
		if (!result.ok) return null
		return {
			id: this.id,
			name: 'LlamaIndex (server)',
			version: null,
			baseUrl: this.serverUrl,
			detectedAt: new Date().toISOString(),
		}
	}

	async listModels(): Promise<ModelInfo[]> {
		// LlamaIndex does not expose a model inventory API; the framework
		// delegates LLM calls to a backend (often Ollama/OpenAI). We report
		// the detected index artifacts as the discoverable surface.
		const artifacts = findIndexArtifacts(this.searchDirs)
		return artifacts.map((artifact, index) => ({
			id: `llamaindex-index-${index}`,
			name: artifact,
			providerId: 'llamaindex',
			sizeBytes: null,
			quantization: null,
			family: 'index',
			served: false,
		}))
	}

	async health(): Promise<ProviderHealth> {
		const result = await boundedFetch({ url: `${this.serverUrl}/health` })
		return {
			healthy: result.ok,
			latencyMs: result.latencyMs,
			error: result.ok
				? null
				: `llamaindex probe failed (status ${result.status})`,
			checkedAt: new Date().toISOString(),
		}
	}
}

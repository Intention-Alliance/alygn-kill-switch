/**
 * Hugging Face Provider Adapter (ADR-135)
 *
 * Hugging Face has no single canonical local HTTP API, so detection is
 * filesystem-first: scan the HF cache (~/.cache/huggingface/hub) and
 * common model directories for downloaded repos. Optionally probes a
 * local Text Generation Inference (TGI) endpoint (default port 8080)
 * for served models.
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
import { boundedFetch, parseArrayField } from '../http'

const DEFAULT_TGI_URL = 'http://127.0.0.1:8080'

interface HuggingFaceAdapterParams {
	cacheDir?: string
	tgiUrl?: string
}

interface TgiModelEntry {
	id?: string
	object?: string
	owned_by?: string
}

function listCacheRepos(cacheDir: string): string[] {
	if (!existsSync(cacheDir)) return []
	try {
		return readdirSync(cacheDir)
			.filter((entry) => entry.startsWith('models--'))
			.map((entry) => entry.replace(/^models--/, '').replace(/--/g, '/'))
	} catch {
		return []
	}
}

function normalizeTgiEntry(entry: TgiModelEntry): ModelInfo | null {
	const id = entry.id
	if (!id) return null
	return {
		id,
		name: id,
		providerId: 'huggingface',
		sizeBytes: null,
		quantization: null,
		family: entry.owned_by ?? null,
		served: true,
	}
}

export class HuggingFaceDiscoveryProvider implements DiscoveryProvider {
	readonly id = 'huggingface' as const
	private readonly cacheDir: string
	private readonly tgiUrl: string

	constructor({
		cacheDir,
		tgiUrl = DEFAULT_TGI_URL,
	}: HuggingFaceAdapterParams = {}) {
		this.cacheDir = cacheDir ?? join(homedir(), '.cache', 'huggingface', 'hub')
		this.tgiUrl = tgiUrl.replace(/\/$/, '')
	}

	async detect(): Promise<ProviderInfo | null> {
		const cacheRepos = listCacheRepos(this.cacheDir)
		if (cacheRepos.length > 0) {
			return {
				id: this.id,
				name: 'Hugging Face',
				version: null,
				baseUrl: null,
				detectedAt: new Date().toISOString(),
			}
		}
		// Fallback: local TGI endpoint serving HF models
		const result = await boundedFetch({ url: `${this.tgiUrl}/v1/models` })
		if (!result.ok) return null
		return {
			id: this.id,
			name: 'Hugging Face (TGI)',
			version: null,
			baseUrl: this.tgiUrl,
			detectedAt: new Date().toISOString(),
		}
	}

	async listModels(): Promise<ModelInfo[]> {
		const cacheRepos = listCacheRepos(this.cacheDir)
		const cachedModels: ModelInfo[] = cacheRepos.map((repo) => ({
			id: repo,
			name: repo,
			providerId: 'huggingface',
			sizeBytes: null,
			quantization: null,
			family: null,
			served: false, // cached repos are not necessarily served
		}))

		const result = await boundedFetch({ url: `${this.tgiUrl}/v1/models` })
		if (!result.ok) return cachedModels
		const servedModels = parseArrayField(result.body, 'data')
			.map((entry) => normalizeTgiEntry(entry as TgiModelEntry))
			.filter((model): model is ModelInfo => model !== null)

		// Merge: served models win over cached-only entries with the same id
		const byId = new Map<string, ModelInfo>()
		for (const model of cachedModels) byId.set(model.id, model)
		for (const model of servedModels) byId.set(model.id, model)
		return [...byId.values()]
	}

	async health(): Promise<ProviderHealth> {
		const result = await boundedFetch({ url: `${this.tgiUrl}/v1/models` })
		return {
			healthy: result.ok,
			latencyMs: result.latencyMs,
			error: result.ok
				? null
				: `huggingface probe failed (status ${result.status})`,
			checkedAt: new Date().toISOString(),
		}
	}
}

/**
 * Discovery HTTP Helper — bounded fetch with timeout
 *
 * Provider probes must never hang the discovery sweep. Every request is
 * bounded by a hard timeout (default 1500ms) and an AbortSignal so a
 * dead endpoint fails fast instead of stalling the sweep.
 *
 * ADR-135: AI-agnostic discovery — provider adapters probe local
 * inference endpoints (Ollama /api/tags, vLLM /v1/models, ...).
 */

const DEFAULT_TIMEOUT_MS = 1500

interface BoundedFetchParams {
	url: string
	timeoutMs?: number
	headers?: Record<string, string>
}

interface BoundedFetchResult {
	ok: boolean
	status: number
	body: unknown
	latencyMs: number
}

/**
 * Fetch a URL with a hard timeout. Returns a structured result instead of
 * throwing, so adapters can degrade gracefully when an endpoint is absent.
 */
export async function boundedFetch({
	url,
	timeoutMs = DEFAULT_TIMEOUT_MS,
	headers,
}: BoundedFetchParams): Promise<BoundedFetchResult> {
	const startedAt = performance.now()
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)

	try {
		const response = await fetch(url, {
			signal: controller.signal,
			headers: { Accept: 'application/json', ...headers },
		})
		const latencyMs = Math.round(performance.now() - startedAt)
		let body: unknown = null
		try {
			body = await response.json()
		} catch {
			body = null
		}
		return { ok: response.ok, status: response.status, body, latencyMs }
	} catch {
		return {
			ok: false,
			status: 0,
			body: null,
			latencyMs: Math.round(performance.now() - startedAt),
		}
	} finally {
		clearTimeout(timer)
	}
}

/**
 * Parse a JSON array field from an unknown response body, tolerating
 * missing/odd shapes so a vendor API change degrades to "no models"
 * instead of throwing.
 */
export function parseArrayField(body: unknown, field: string): unknown[] {
	if (body === null || typeof body !== 'object') return []
	const record = body as Record<string, unknown>
	const value = record[field]
	return Array.isArray(value) ? value : []
}

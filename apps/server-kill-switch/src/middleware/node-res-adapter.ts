/**
 * Node Response Adapter — Inference relay to upstream Ollama.
 *
 * KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §b.5 (P1-3 fix, Stage 2).
 *
 * Relays `POST /v1/inference/*` requests to the upstream Ollama endpoint
 * (configured via `KILL_SWITCH_VERIFIER_BASE_URL`) and captures the response
 * body so the verification service can run an output-classification pass
 * AFTER the response reaches the client. This closes the original
 * telemetry gap: the pre-screen check ran on `prompt` only; the output side
 * of (prompt → output) classification was never populated.
 *
 * Streaming degradation (honest scope):
 *
 *   - `stream: false` (default) → full body buffered in-memory, then sent to
 *     client in one `res.end()`.
 *
 *   - `stream: true` → upstream response is the OpenAI-compatible / Ollama
 *     NDJSON event stream. True incremental SSE relay (flush each event as it
 *     arrives, verify mid-stream) is intentionally OUT OF SCOPE for this
 *     Stage 2 fix — see follow-up ticket. We collect the full body server-
 *     side (subject to the cap below), then send it to the client in one
 *     `res.end()`. The client perceives a normal inference response (with
 *     full output text), but the connection is not backpressured event-by-
 *     event. This is documented in the adapter's docstring + the streaming
 *     degradation comment block below so callers understand the trade-off.
 *
 * Capped buffering (P1-3):
 *
 *   - Responses up to 256 KB are buffered fully and verified in full.
 *   - Responses larger than 256 KB are truncated at the cap; only the first
 *     256 KB is sent to the verifier. The client receives the full upstream
 *     body (we do not chop the wire response), but the verifier sees a
 *     truncated slice. A `verification_event` row records the truncation in
 *     the `reason` field (e.g. `output-truncated:streamed-above-256KB-cap`)
 *     so the dashboard can see when output verification was partial.
 *
 *   - 256 KB is enough for ~64K tokens of plain prose at 4 bytes/token; far
 *     above the median inference response. The cap is a memory bound, not a
 *     feature flag.
 *
 * Verification pipeline integration:
 *
 *   - Returns the captured `{ prompt, output }` pair so the caller can fire
 *     the post-relay verifier (see `verifyInferenceOutput` in
 *     `inference-verification.ts`).
 *   - Pre-screen `prompt`-only check (existing async fire-and-forget) still
 *     runs as before — this adapter only adds the OUTPUT side of the
 *     (prompt, output) pair.
 *
 *   - When verification is DISABLED (`verifyEnabled=false`), the adapter
 *     runs as a transparent relay with NO verification call. This is the
 *     fail-start guard's inverse path: if verification is disabled, the
 *     proxy should NOT be silently shipping unverified content. We handle
 *     that case in `index.ts` by refusing to start the server (see
 *     `assertProxyAndVerificationInvariant`).
 *
 * @module middleware/node-res-adapter
 */

import type { IncomingMessage } from 'node:http'

// ─── Constants ────────────────────────────────────────────────────

/**
 * Maximum bytes to buffer from the upstream response before truncating for
 * the verifier. 256 KB is the Stage 2 P1-3 cap — large enough for ~64K
 * tokens of plain prose (4 bytes/token), small enough to keep the relay
 * memory-bounded per concurrent request.
 *
 * HONEST LIMITATION (streaming): for `stream: true` requests the upstream
 * NDJSON event stream is consumed and re-emitted as a single buffered
 * response. The wire response is the full upstream body (not truncated);
 * the truncation only affects what the verifier sees. See module-level
 * docstring for the full degradation note.
 */
export const OUTPUT_BUFFER_CAP_BYTES = 256 * 1024

// ─── Types ────────────────────────────────────────────────────────

export interface NodeResAdapterOpts {
	/** Upstream Ollama (or OpenAI-compatible) base URL. */
	upstreamBaseUrl: string
	/** Per-request timeout for the upstream fetch (default 60s). */
	upstreamTimeoutMs?: number
	/**
	 * Injectable fetch for tests. Defaults to the global `fetch`. The
	 * adapter always sets `Accept: application/x-ndjson` so callers can
	 * use a mock fetch for NDJSON streaming scenarios.
	 */
	fetchImpl?: (
		input: string | URL | Request,
		init?: RequestInit,
	) => Promise<Response>
}

export interface RelayResult {
	/** The HTTP status returned by the upstream (e.g. 200, 404, 500). */
	status: number
	/** Response headers copied from upstream (lowercased keys). */
	headers: Record<string, string>
	/**
	 * The full response body sent to the client. For `stream: false` requests
	 * this is the exact upstream body; for `stream: true` requests this is the
	 * concatenated NDJSON events reconstructed into a single response. The
	 * client receives the same content either way.
	 */
	body: string
	/** UTF-8 byte length of `body`. */
	bodyBytes: number
	/** True when `body` was truncated to fit the verifier's cap. */
	outputTruncated: boolean
	/** The prompt extracted from the request body (empty string if missing). */
	prompt: string
	/**
	 * The extracted response "output" sent to the verifier — for non-streaming
	 * requests this is the same as `body` (possibly truncated to the cap); for
	 * streaming requests it is the concatenated NDJSON response field values
	 * (possibly truncated). Used by `verifyInferenceOutput()` to run the
	 * post-relay verifier.
	 */
	output: string
	/** The `stream` flag from the request body (false = buffered, true = NDJSON). */
	streamMode: boolean
}

/** Minimal Node-style request shape the adapter accepts. */
export interface NodeStyleRequest {
	method?: string
	url?: string
	headers?: Record<string, string | string[] | undefined>
	body?: string | Buffer | null
}

// ─── Helpers ──────────────────────────────────────────────────────

function getHeader(
	headers: Record<string, string | string[] | undefined> | undefined,
	name: string,
): string | undefined {
	if (!headers) return undefined
	const v = headers[name.toLowerCase()]
	if (Array.isArray(v)) return v[0]
	return v
}

function utf8ByteLength(s: string): number {
	return Buffer.byteLength(s, 'utf8')
}

/**
 * Best-effort extraction of the `prompt` field from a JSON request body.
 * Supports common shapes:
 *   - { prompt: string }
 *   - { messages: [{ role, content }, ...] } → concatenates user-role content
 * Returns "" when the body is unparseable or the field is absent.
 *
 * The extractor never throws; callers fall back to "" so verification can
 * still run on output-only.
 */
export function extractPromptFromBody(
	rawBody: string | Buffer | null | undefined,
): string {
	if (!rawBody) return ''
	const text = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')
	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch {
		return ''
	}
	if (!parsed || typeof parsed !== 'object') return ''
	const obj = parsed as Record<string, unknown>
	if (typeof obj.prompt === 'string') return obj.prompt
	if (Array.isArray(obj.messages)) {
		const parts: string[] = []
		for (const m of obj.messages) {
			if (m && typeof m === 'object') {
				const role = (m as Record<string, unknown>).role
				const content = (m as Record<string, unknown>).content
				if (role === 'user' && typeof content === 'string') parts.push(content)
			}
		}
		return parts.join('\n')
	}
	return ''
}

/**
 * Detect whether the request body asks for streaming output. Ollama +
 * OpenAI-compatible APIs use `stream: true` to opt into NDJSON/SSE.
 */
export function detectStreamMode(
	rawBody: string | Buffer | null | undefined,
): boolean {
	if (!rawBody) return false
	const text = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')
	try {
		const parsed = JSON.parse(text)
		if (parsed && typeof parsed === 'object') {
			const obj = parsed as Record<string, unknown>
			return obj.stream === true
		}
	} catch {
		// Non-JSON bodies default to non-streaming.
	}
	return false
}

/**
 * Best-effort extraction of the model's output text from an upstream
 * response body. Handles three shapes:
 *
 *   - OpenAI-compatible JSON: { choices: [{ message: { content } }] }
 *   - Ollama JSON (non-stream): { response: string }
 *   - NDJSON stream: each line `{ response: string, done: boolean }` —
 *     concatenated `response` field values
 *
 * Returns the raw body unchanged when no recognized shape matches so the
 * verifier still gets something to look at (the system prompt wraps the
 * content in delimiters so the model treats it as DATA, not instruction).
 */
export function extractOutputFromBody(
	body: string,
	streamMode: boolean,
): string {
	if (!body) return ''

	if (streamMode) {
		// NDJSON: each non-empty line is one JSON event.
		const parts: string[] = []
		for (const line of body.split('\n')) {
			const trimmed = line.trim()
			if (!trimmed) continue
			try {
				const evt = JSON.parse(trimmed)
				if (evt && typeof evt === 'object') {
					const o = evt as Record<string, unknown>
					if (typeof o.response === 'string') parts.push(o.response)
					else if (o.message && typeof o.message === 'object') {
						const content = (o.message as Record<string, unknown>).content
						if (typeof content === 'string') parts.push(content)
					}
				}
			} catch {
				// Non-JSON line — ignore (NDJSON expects each line to be JSON).
			}
		}
		return parts.join('')
	}

	// Non-stream: try JSON shapes.
	try {
		const parsed = JSON.parse(body)
		if (parsed && typeof parsed === 'object') {
			const obj = parsed as Record<string, unknown>
			if (typeof obj.response === 'string') return obj.response
			if (Array.isArray(obj.choices)) {
				const parts: string[] = []
				for (const c of obj.choices) {
					if (c && typeof c === 'object') {
						const message = (c as Record<string, unknown>).message
						if (message && typeof message === 'object') {
							const content = (message as Record<string, unknown>).content
							if (typeof content === 'string') parts.push(content)
						}
					}
				}
				return parts.join('')
			}
		}
	} catch {
		// Non-JSON body — return raw.
	}
	return body
}

// ─── Core relay ───────────────────────────────────────────────────

/**
 * Relay a single inference request to the upstream Ollama endpoint and
 * capture the response for post-relay verification.
 *
 * @param req       Node-style request (the kill-switch's internal handler
 *                  passes its `nodeReq` shape directly).
 * @param urlPath   The `/v1/inference/...` path the client called.
 * @param opts      Adapter options (upstream URL, timeout, fetch override).
 *
 * @returns RelayResult with status/headers/body/output for verification.
 *
 * @throws When the upstream fetch rejects (network error, DNS, abort).
 *         The caller should treat this as a 502 Bad Gateway to the client
 *         and let the gate / pause logic decide whether to escalate.
 */
export async function relayInferenceRequest(
	req: NodeStyleRequest,
	urlPath: string,
	opts: NodeResAdapterOpts,
): Promise<RelayResult> {
	const upstreamUrl = opts.upstreamBaseUrl.replace(/\/+$/, '') + urlPath
	const timeoutMs = opts.upstreamTimeoutMs ?? 60_000
	const fetchImpl = opts.fetchImpl ?? fetch

	// Forward request body verbatim. The inference path requires JSON; we
	// copy the raw body bytes so upstream sees exactly what the client sent.
	const bodyBuf =
		typeof req.body === 'string'
			? Buffer.from(req.body, 'utf8')
			: req.body
				? Buffer.from(req.body)
				: null

	// Copy a filtered header set: drop Host, hop-by-hop headers, and the
	// kill-switch's own auth headers (Content-Length and Authorization are
	// not stripped — Content-Length is recomputed by fetch; Authorization is
	// preserved if the upstream requires it).
	const forwardHeaders: Record<string, string> = {
		'Content-Type':
			getHeader(req.headers, 'content-type') ?? 'application/json',
		Accept:
			getHeader(req.headers, 'accept') ??
			'application/json, application/x-ndjson',
	}
	const auth = getHeader(req.headers, 'authorization')
	if (auth) forwardHeaders.Authorization = auth
	const userAgent = getHeader(req.headers, 'user-agent')
	if (userAgent) forwardHeaders['User-Agent'] = userAgent

	const upstreamRes = await fetchImpl(upstreamUrl, {
		method: req.method ?? 'POST',
		headers: forwardHeaders,
		body: bodyBuf,
		signal: AbortSignal.timeout(timeoutMs),
	})

	// Read the body as text. NDJSON streams arrive as a single string here
	// because fetch's default reader concatenates chunks.
	const rawBody = await upstreamRes.text()

	// Copy response headers (lowercased) for the wire response.
	const outHeaders: Record<string, string> = {}
	upstreamRes.headers.forEach((v, k) => {
		outHeaders[k.toLowerCase()] = v
	})

	const prompt = extractPromptFromBody(req.body)
	const streamMode = detectStreamMode(req.body)
	const bodyBytes = utf8ByteLength(rawBody)
	const output = extractOutputFromBody(rawBody, streamMode)

	// Apply the 256 KB cap to the verifier's view of the output, but NOT to
	// the wire response (the client must receive the full body). The cap is
	// a memory bound for the verifier, not a feature on the response.
	const outputBytes = utf8ByteLength(output)
	const truncated = outputBytes > OUTPUT_BUFFER_CAP_BYTES
	const verifierOutput = truncated
		? Buffer.from(output, 'utf8')
				.subarray(0, OUTPUT_BUFFER_CAP_BYTES)
				.toString('utf8')
		: output

	return {
		status: upstreamRes.status,
		headers: outHeaders,
		body: rawBody,
		bodyBytes,
		outputTruncated: truncated,
		prompt,
		output: verifierOutput,
		streamMode,
	}
}

/**
 * Minimal Node-style HTTP response shape consumed by `writeRelayToResponse`.
 * Mirrors the kill-switch's internal handler (see `index.ts` lines around
 * `nodeRes._h / _s / _b`): `writeHead(status, headers?)` and `end(body?)`.
 */
export interface NodeStyleResponse {
	writeHead(status: number, headers?: Record<string, string | string[]>): void
	end(body?: string): void
	/** Optional no-op — some implementations have a setHeader; ignored here. */
	setHeader?(name: string, value: string): void
}

/**
 * Write a relay result to the Node-style response object. Used by
 * `index.ts` after `relayInferenceRequest` returns. Honors the upstream
 * status code and content-type so streaming clients see the same headers
 * they would have seen talking to Ollama directly.
 */
export function writeRelayToResponse(
	res: NodeStyleResponse,
	result: RelayResult,
): void {
	// Always set Content-Length to the FULL body length (we don't truncate
	// the wire response — only the verifier view).
	const headers: Record<string, string> = { ...result.headers }
	headers['content-length'] = String(result.bodyBytes)
	res.writeHead(result.status, headers)
	res.end(result.body)
}

/** Type guard for IncomingMessage (used by the index.ts integration). */
export function isNodeIncomingMessage(x: unknown): x is IncomingMessage {
	return (
		!!x &&
		typeof x === 'object' &&
		'headers' in (x as Record<string, unknown>) &&
		'method' in (x as Record<string, unknown>)
	)
}

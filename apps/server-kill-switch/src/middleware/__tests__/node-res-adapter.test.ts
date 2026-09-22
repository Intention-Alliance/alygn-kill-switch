/**
 * Node Response Adapter Tests — P1-3 (Stage 2 fix).
 *
 * Verifies:
 *  - Prompt extraction from JSON body (OpenAI messages array + plain prompt)
 *  - Stream mode detection (stream: true / false)
 *  - Output extraction (OpenAI JSON / Ollama JSON / NDJSON)
 *  - 256 KB cap on verifier output (truncation flag set; wire body unchanged)
 *  - Header forwarding (Content-Type, Accept, Authorization, User-Agent)
 *  - Upstream URL construction (base + path, trailing slash tolerance)
 *  - Method propagation (POST)
 *  - Error propagation (upstream fetch rejects)
 *  - writeRelayToResponse uses full bodyBytes for Content-Length
 */

import { describe, expect, it } from 'bun:test'
import {
	detectStreamMode,
	extractOutputFromBody,
	extractPromptFromBody,
	type NodeStyleRequest,
	type NodeStyleResponse,
	OUTPUT_BUFFER_CAP_BYTES,
	type RelayResult,
	relayInferenceRequest,
	writeRelayToResponse,
} from '../node-res-adapter'

// ─── Test helpers ────────────────────────────────────────────────

function makeReq(
	body: string | object | null,
	headers: Record<string, string> = {},
): NodeStyleRequest {
	const text =
		body === null || body === undefined
			? null
			: typeof body === 'string'
				? body
				: JSON.stringify(body)
	return {
		method: 'POST',
		url: '/v1/inference/chat',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json',
			...headers,
		},
		body: text,
	}
}

interface CapturedFetch {
	url: string
	init: RequestInit
	called: number
}

function makeFetchMock(
	upstreamStatus: number,
	upstreamBody: string,
	upstreamHeaders: Record<string, string> = {},
): {
	fetchImpl: (
		input: string | URL | Request,
		init?: RequestInit,
	) => Promise<Response>
	captured: CapturedFetch
} {
	const captured: CapturedFetch = {
		url: '',
		init: {} as RequestInit,
		called: 0,
	}
	const fetchImpl = async (
		input: string | URL | Request,
		init?: RequestInit,
	): Promise<Response> => {
		captured.url = typeof input === 'string' ? input : input.toString()
		captured.init = init ?? {}
		captured.called++
		const headers = new Headers(upstreamHeaders)
		return new Response(upstreamBody, { status: upstreamStatus, headers })
	}
	return { fetchImpl, captured }
}

// ─── extractPromptFromBody ───────────────────────────────────────

describe('extractPromptFromBody', () => {
	it('extracts plain prompt field', () => {
		expect(extractPromptFromBody(JSON.stringify({ prompt: 'Hello' }))).toBe(
			'Hello',
		)
	})

	it('concatenates user-role messages from OpenAI shape', () => {
		const body = JSON.stringify({
			messages: [
				{ role: 'system', content: 'You are helpful.' },
				{ role: 'user', content: 'Hi' },
				{ role: 'assistant', content: 'Hello' },
				{ role: 'user', content: 'How are you?' },
			],
		})
		expect(extractPromptFromBody(body)).toBe('Hi\nHow are you?')
	})

	it('returns "" for empty body', () => {
		expect(extractPromptFromBody(null)).toBe('')
		expect(extractPromptFromBody('')).toBe('')
		expect(extractPromptFromBody(undefined)).toBe('')
	})

	it('returns "" for non-JSON body', () => {
		expect(extractPromptFromBody('not json')).toBe('')
	})

	it('returns "" when prompt is missing', () => {
		expect(
			extractPromptFromBody(JSON.stringify({ model: 'qwen2.5:0.5b' })),
		).toBe('')
	})

	it('handles Buffer body', () => {
		const buf = Buffer.from(JSON.stringify({ prompt: 'Buffer prompt' }), 'utf8')
		expect(extractPromptFromBody(buf)).toBe('Buffer prompt')
	})
})

// ─── detectStreamMode ────────────────────────────────────────────

describe('detectStreamMode', () => {
	it('returns true when stream:true', () => {
		expect(detectStreamMode(JSON.stringify({ stream: true }))).toBe(true)
	})

	it('returns false when stream:false', () => {
		expect(detectStreamMode(JSON.stringify({ stream: false }))).toBe(false)
	})

	it('returns false when stream is missing', () => {
		expect(detectStreamMode(JSON.stringify({ model: 'qwen' }))).toBe(false)
	})

	it('returns false for non-JSON body', () => {
		expect(detectStreamMode('not json')).toBe(false)
	})

	it('returns false for empty body', () => {
		expect(detectStreamMode(null)).toBe(false)
		expect(detectStreamMode('')).toBe(false)
	})
})

// ─── extractOutputFromBody ───────────────────────────────────────

describe('extractOutputFromBody', () => {
	it('extracts OpenAI choices[0].message.content', () => {
		const body = JSON.stringify({
			choices: [{ message: { content: 'Hi there!' }, finish_reason: 'stop' }],
		})
		expect(extractOutputFromBody(body, false)).toBe('Hi there!')
	})

	it('extracts Ollama { response } for non-stream', () => {
		const body = JSON.stringify({ response: 'Ollama answer', done: true })
		expect(extractOutputFromBody(body, false)).toBe('Ollama answer')
	})

	it('returns raw body for non-JSON (treated as plain text)', () => {
		expect(extractOutputFromBody('plain text response', false)).toBe(
			'plain text response',
		)
	})

	it('concatenates NDJSON events for stream mode', () => {
		const ndjson = [
			JSON.stringify({ response: 'Hello', done: false }),
			JSON.stringify({ response: ' world', done: false }),
			JSON.stringify({ response: '!', done: true }),
		].join('\n')
		expect(extractOutputFromBody(ndjson, true)).toBe('Hello world!')
	})

	it('skips non-JSON lines in NDJSON (defensive)', () => {
		const ndjson = [
			JSON.stringify({ response: 'ok', done: false }),
			'not a json line',
			JSON.stringify({ response: '!', done: true }),
		].join('\n')
		expect(extractOutputFromBody(ndjson, true)).toBe('ok!')
	})

	it('handles NDJSON with message.content shape (OpenAI streaming)', () => {
		const ndjson = [
			JSON.stringify({ message: { content: 'Hello' }, done: false }),
			JSON.stringify({ message: { content: ' world' }, done: true }),
		].join('\n')
		expect(extractOutputFromBody(ndjson, true)).toBe('Hello world')
	})
})

// ─── relayInferenceRequest ───────────────────────────────────────

describe('relayInferenceRequest', () => {
	it('forwards POST + body + content-type to upstream', async () => {
		const { fetchImpl, captured } = makeFetchMock(200, '{"response":"hi"}')
		const result = await relayInferenceRequest(
			makeReq({ prompt: 'Hi', model: 'qwen2.5:0.5b' }),
			'/v1/inference/chat',
			{ upstreamBaseUrl: 'http://127.0.0.1:11434', fetchImpl },
		)
		expect(captured.called).toBe(1)
		expect(captured.url).toBe('http://127.0.0.1:11434/v1/inference/chat')
		expect(captured.init.method).toBe('POST')
		expect(
			(captured.init.headers as Record<string, string>)['Content-Type'],
		).toBe('application/json')
		// Body is forwarded as a Buffer (the adapter wraps the string body in
		// Buffer.from so fetch can stream it to upstream). Compare against the
		// Buffer view of the same JSON to avoid string vs Buffer mismatch.
		const expectedBody = JSON.stringify({ prompt: 'Hi', model: 'qwen2.5:0.5b' })
		const actualBody =
			captured.init.body instanceof Buffer
				? captured.init.body.toString('utf8')
				: String(captured.init.body)
		expect(actualBody).toBe(expectedBody)
		expect(result.status).toBe(200)
		expect(result.prompt).toBe('Hi')
		expect(result.output).toBe('hi')
		expect(result.streamMode).toBe(false)
		expect(result.outputTruncated).toBe(false)
	})

	it('tolerates trailing slash on upstream base URL', async () => {
		const { fetchImpl, captured } = makeFetchMock(200, '{}')
		await relayInferenceRequest(makeReq({}), '/v1/inference/chat', {
			upstreamBaseUrl: 'http://127.0.0.1:11434/',
			fetchImpl,
		})
		expect(captured.url).toBe('http://127.0.0.1:11434/v1/inference/chat')
	})

	it('forwards Authorization and User-Agent when present', async () => {
		const { fetchImpl, captured } = makeFetchMock(200, '{}')
		await relayInferenceRequest(
			makeReq(
				{},
				{ authorization: 'Bearer abc', 'user-agent': 'my-client/1.0' },
			),
			'/v1/inference/chat',
			{ upstreamBaseUrl: 'http://127.0.0.1:11434', fetchImpl },
		)
		const h = captured.init.headers as Record<string, string>
		expect(h.Authorization).toBe('Bearer abc')
		expect(h['User-Agent']).toBe('my-client/1.0')
	})

	it('captures upstream status + headers + body verbatim', async () => {
		const { fetchImpl } = makeFetchMock(404, '{"error":"not found"}', {
			'x-custom': 'yes',
			'content-type': 'application/json',
		})
		const result = await relayInferenceRequest(
			makeReq({ prompt: 'x' }),
			'/v1/inference/chat',
			{ upstreamBaseUrl: 'http://127.0.0.1:11434', fetchImpl },
		)
		expect(result.status).toBe(404)
		expect(result.headers['x-custom']).toBe('yes')
		expect(result.body).toBe('{"error":"not found"}')
	})

	it('throws when upstream fetch rejects (network error)', async () => {
		const fetchImpl = async () => {
			throw new Error('ECONNREFUSED')
		}
		await expect(
			relayInferenceRequest(makeReq({ prompt: 'x' }), '/v1/inference/chat', {
				upstreamBaseUrl: 'http://127.0.0.1:11434',
				fetchImpl,
			}),
		).rejects.toThrow('ECONNREFUSED')
	})

	// ─── P1-3: 256 KB cap on verifier output ────────────────────────

	it('caps the verifier output at OUTPUT_BUFFER_CAP_BYTES (truncation flag set)', async () => {
		// Build a body whose extracted `response` field exceeds the cap.
		// The Ollama { response } extractor reads the entire JSON string and
		// returns it, so the JSON body itself must be > 256KB.
		const big = 'A'.repeat(OUTPUT_BUFFER_CAP_BYTES + 1024)
		const upstreamBody = JSON.stringify({ response: big, done: true })
		expect(Buffer.byteLength(upstreamBody, 'utf8')).toBeGreaterThan(
			OUTPUT_BUFFER_CAP_BYTES,
		)

		const { fetchImpl } = makeFetchMock(200, upstreamBody)
		const result = await relayInferenceRequest(
			makeReq({ prompt: 'big' }),
			'/v1/inference/chat',
			{ upstreamBaseUrl: 'http://127.0.0.1:11434', fetchImpl },
		)

		// Wire response is the FULL body — the client receives it intact.
		expect(result.body).toBe(upstreamBody)
		expect(result.bodyBytes).toBe(Buffer.byteLength(upstreamBody, 'utf8'))
		// Verifier sees only the first 256 KB.
		expect(Buffer.byteLength(result.output, 'utf8')).toBe(
			OUTPUT_BUFFER_CAP_BYTES,
		)
		expect(result.outputTruncated).toBe(true)
	})

	it('does not truncate when output is exactly at the cap (cap is strict-greater)', async () => {
		// Extracted `output` is exactly OUTPUT_BUFFER_CAP_BYTES bytes — the
		// truncation rule is `outputBytes > cap`, so this case is NOT truncated.
		// (The wire JSON body is larger because of the JSON wrapper, but the
		// cap applies to the extracted output text, not the wire body.)
		const at = 'B'.repeat(OUTPUT_BUFFER_CAP_BYTES)
		const upstreamBody = JSON.stringify({ response: at, done: true })
		const { fetchImpl } = makeFetchMock(200, upstreamBody)
		const result = await relayInferenceRequest(
			makeReq({ prompt: 'exact' }),
			'/v1/inference/chat',
			{ upstreamBaseUrl: 'http://127.0.0.1:11434', fetchImpl },
		)
		expect(result.outputTruncated).toBe(false)
		expect(Buffer.byteLength(result.output, 'utf8')).toBe(
			OUTPUT_BUFFER_CAP_BYTES,
		)
		// Wire body is the full upstream body (with JSON wrapper).
		expect(result.body).toBe(upstreamBody)
	})

	it('does not truncate when output is small', async () => {
		const { fetchImpl } = makeFetchMock(
			200,
			JSON.stringify({ response: 'small' }),
		)
		const result = await relayInferenceRequest(
			makeReq({ prompt: 'small' }),
			'/v1/inference/chat',
			{ upstreamBaseUrl: 'http://127.0.0.1:11434', fetchImpl },
		)
		expect(result.output).toBe('small')
		expect(result.outputTruncated).toBe(false)
	})

	it('handles streaming NDJSON bodies and extracts concatenated output', async () => {
		const events = [
			JSON.stringify({ response: 'Hello', done: false }),
			JSON.stringify({ response: ' world', done: false }),
			JSON.stringify({ response: '!', done: true }),
		].join('\n')
		const { fetchImpl } = makeFetchMock(200, events)
		const result = await relayInferenceRequest(
			makeReq({ prompt: 'stream', stream: true }),
			'/v1/inference/chat',
			{ upstreamBaseUrl: 'http://127.0.0.1:11434', fetchImpl },
		)
		expect(result.streamMode).toBe(true)
		expect(result.output).toBe('Hello world!')
		expect(result.body).toBe(events) // wire body is the raw NDJSON
	})
})

// ─── writeRelayToResponse ────────────────────────────────────────

describe('writeRelayToResponse', () => {
	function captureRes(): {
		res: NodeStyleResponse
		calls: { status: number; headers: Record<string, string>; body: string }
	} {
		const calls: {
			status: number
			headers: Record<string, string>
			body: string
		} = {
			status: 0,
			headers: {},
			body: '',
		}
		const res: NodeStyleResponse = {
			writeHead(status, headers) {
				calls.status = status
				calls.headers = { ...(headers as Record<string, string>) }
			},
			end(body) {
				calls.body = body ?? ''
			},
		}
		return { res, calls }
	}

	it('writes upstream status + content-length matching bodyBytes', () => {
		const { res, calls } = captureRes()
		const result: RelayResult = {
			status: 200,
			headers: { 'content-type': 'application/json' },
			body: '{"ok":true}',
			bodyBytes: Buffer.byteLength('{"ok":true}', 'utf8'),
			outputTruncated: false,
			prompt: 'p',
			output: 'o',
			streamMode: false,
		}
		writeRelayToResponse(res, result)
		expect(calls.status).toBe(200)
		expect(calls.headers['content-length']).toBe(
			String(Buffer.byteLength('{"ok":true}', 'utf8')),
		)
		expect(calls.headers['content-type']).toBe('application/json')
		expect(calls.body).toBe('{"ok":true}')
	})

	it('uses full bodyBytes for Content-Length even when output was truncated', () => {
		const big = 'X'.repeat(OUTPUT_BUFFER_CAP_BYTES + 100)
		const { res, calls } = captureRes()
		const result: RelayResult = {
			status: 200,
			headers: {},
			body: big,
			bodyBytes: Buffer.byteLength(big, 'utf8'),
			outputTruncated: true,
			prompt: 'p',
			output: big.slice(0, OUTPUT_BUFFER_CAP_BYTES),
			streamMode: false,
		}
		writeRelayToResponse(res, result)
		// Content-Length must match the WIRE body, not the truncated verifier slice.
		expect(calls.headers['content-length']).toBe(
			String(Buffer.byteLength(big, 'utf8')),
		)
		expect(calls.body).toBe(big)
	})
})

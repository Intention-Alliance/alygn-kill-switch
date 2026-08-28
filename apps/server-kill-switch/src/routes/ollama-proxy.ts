/**
 * Ollama Reverse-Proxy Routes — kill-switch verification layer for ALL
 * machine inference lanes (infra consult #3 — 2026-08-27).
 *
 * nginx (11435/8080) is the auth gate (PCA key + IP allowlist) and injects
 * `X-API-Key: <KILL_SWITCH_API_KEY>`. These routes verify that header
 * (defense in depth — reject 401 on missing/mismatch) and proxy to the
 * ordered upstream list (KILL_SWITCH_OLLAMA_UPSTREAMS — first = primary,
 * rest = failover; try-in-order, log-which-served, periodic health check).
 *
 * Verification (P1-1 hybrid — Andler's refinement):
 *   - SINGLE post-relay verification event: this route captures the upstream
 *     response (capped buffer — MAX_BUFFER_BYTES) and fires ONE verification
 *     event fire-and-forget AFTER relaying to the client, containing BOTH
 *     the request prompt and the extracted output. There is NO separate
 *     prompt pre-screen for the proxy lanes — the inference-verification
 *     middleware hook (index.ts) skips proxy paths (P2-1 auth-first: the
 *     route fires verification only after its own X-API-Key check). The
 *     legacy /v1/inference/* lane still has the hook's prompt pre-screen.
 *   - Fingerprint-scoped halt: an UNSAFE output verdict blocks THE REQUEST'S
 *     FINGERPRINT (machineId/sessionId → X-API-Key → IP+UA hash), not the
 *     whole fleet. The global kill_switch_state is only flipped by the
 *     escalation rule (ALL active fingerprints UNSAFE in the eval window).
 *
 * Streaming: responses are relayed as a BUFFERED pass-through — the node
 * response adapter accumulates chunks via write() and resolves the full
 * body at end(). It is NOT incremental SSE streaming: streaming clients
 * receive the complete body when the upstream completes. Incremental SSE
 * is a future refactor (Bun.serve fetch-streaming). The buffer is capped
 * at MAX_BUFFER_BYTES (64 MiB) — a runaway generation aborts with
 * 502 + `{ error: 'response_too_large' }` instead of OOM-ing the
 * kill-switch.
 *
 * KNOWN GAP (streamed-output verification): streamed generation responses
 * (NDJSON for /api/generate?stream=true, SSE for /v1/chat/completions
 * stream) are NOT output-verified. extractGenerationOutput() only parses
 * single-document JSON bodies; a streamed body yields '' → the verifier
 * treats it as pass-through. This is by design under the buffered
 * pass-through refinement (the full streamed body is relayed, but not
 * reassembled into a verifiable document) and is the residual of the
 * original P1-1 "output never verified" complaint. Prompt-side verification
 * still applies to streamed requests; output-side verification for streamed
 * lanes is a future refactor (SSE reassembly before verification).
 */

import { secureCompare } from '../utils/secure-compare';
import type { VerificationService } from '../services/verification/verification-service';
import { deriveFingerprint, type FingerprintSource } from '../services/fingerprint-halt';
import { MAX_BUFFER_BYTES } from '../utils/node-res-adapter';

// ─── Path matching ────────────────────────────────────────────────

/** Generation endpoints — POST, verification fires before proxying. */
const GENERATION_PATHS = new Set([
  '/v1/chat/completions', // OpenAI-compatible chat (opencode, open-webui)
  '/v1/completions',      // OpenAI-compatible completions
  '/api/chat',            // Ollama native chat (open-webui)
  '/api/generate',        // Ollama native generate
]);

/** Metadata / non-generation endpoints — pass through unverified. */
const METADATA_PATHS = new Set([
  '/v1/models',           // OpenAI-compatible model list (opencode)
  '/v1/embeddings',       // OpenAI-compatible embeddings
  '/api/tags',            // Ollama model list
  '/api/version',         // Ollama version
  '/api/ps',              // Ollama running models
  '/api/show',            // Ollama model info
  '/api/embed',           // Ollama embeddings
  '/api/embeddings',      // Ollama embeddings (alias)
  '/api/embedding',       // Ollama embeddings (legacy alias)
  '/api/copy',            // Ollama model copy
  '/api/create',          // Ollama model create
  '/api/pull',            // Ollama model pull
  '/api/push',            // Ollama model push
  '/api/delete',          // Ollama model delete
]);

/** Prefix-matched pass-through paths (binary blobs for model create). */
const BLOB_PREFIX = '/api/blobs/';

/**
 * Pure path matcher — is this an Ollama-native path the kill-switch proxies?
 * Method-agnostic; used by the rate limiter and auth-bypass decisions.
 */
export function isOllamaProxyPath(path: string): boolean {
  const p = path.split('?')[0];
  return GENERATION_PATHS.has(p) || METADATA_PATHS.has(p) || p.startsWith(BLOB_PREFIX);
}

/**
 * Request matcher — returns whether the request is an Ollama proxy path and
 * whether it is a verified (generation) lane.
 */
export function isOllamaProxyRequest(
  method: string,
  url: string,
): { matched: boolean; verified: boolean } {
  const p = url.split('?')[0];
  if (!isOllamaProxyPath(p)) return { matched: false, verified: false };
  return { matched: true, verified: method === 'POST' && GENERATION_PATHS.has(p) };
}

// ─── Types ─────────────────────────────────────────────────────────

export interface OllamaProxyRouteOpts {
  /** Expected X-API-Key value. Defaults to process.env.KILL_SWITCH_API_KEY. */
  apiKey?: string;
  /**
   * Ordered upstream list — first = primary, rest = failover.
   */
  upstreams?: string[];
  /** Read timeout for upstream fetches (default 5_400_000 = 90 min, matches nginx). */
  timeoutMs?: number;
  /** Injectable fetch for tests. */
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  /** Injectable logger (defaults to console.log with a prefix). */
  log?: (msg: string) => void;
  /**
   * Verification service (P1-1). When present, generation paths fire OUTPUT
   * verification fire-and-forget after relaying the upstream response.
   */
  verification?: VerificationService;
  /**
   * Fingerprint identity signals for the request (P1-1). Used to scope the
   * output-verification halt to the offending fingerprint.
   */
  fingerprintSource?: FingerprintSource;
}

interface NodeRes {
  writeHead: (status: number, headers?: Record<string, string>) => void;
  write: (chunk: string | Uint8Array) => void;
  end: (data?: string) => void;
  /** P1-3: set by the node-res-adapter when the buffer cap is exceeded. */
  _aborted?: boolean;
  /** Buffered body (node-res-adapter contract) — read for output verification. */
  _b?: string;
  /** Response headers (node-res-adapter contract) — read for content-type. */
  _h?: Record<string, string>;
}

interface NodeReq {
  headers?: Record<string, string | undefined>;
  body?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────

const HOP_BY_HOP_HEADERS = new Set([
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'upgrade',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
]);

/** Headers that must never leak to the upstream (auth + hop-by-hop). */
const STRIPPED_REQUEST_HEADERS = new Set([
  'x-api-key',
  'authorization',
  'cookie',
  'host',
  'content-length',
  'connection',
  'keep-alive',
  'upgrade',
  'transfer-encoding',
  'te',
  'trailer',
  'proxy-authorization',
  'proxy-authenticate',
]);

function defaultLog(msg: string): void {
  console.log(msg);
}

/**
 * Reject path-traversal segments (`..` / `%2e%2e` / mixed encodings) in
 * proxy paths — defense in depth before the path is joined to an upstream
 * base URL. Decodes percent-encoding (including malformed sequences) so
 * `%2e%2e`, `%2e.`, `.%2e` and double-encoded variants are all caught.
 */
function hasPathTraversal(path: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // Malformed percent-encoding — treat as suspicious.
    return true;
  }
  return decoded.split('/').some((segment) => segment === '..');
}

function writeJson(res: NodeRes, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function buildRequestHeaders(req: NodeReq): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers ?? {})) {
    if (typeof v === 'string' && !STRIPPED_REQUEST_HEADERS.has(k.toLowerCase())) {
      out[k] = v;
    }
  }
  return out;
}

function buildResponseHeaders(upstreamRes: Response): Record<string, string> {
  const out: Record<string, string> = {};
  upstreamRes.headers.forEach((v, k) => {
    if (!HOP_BY_HOP_HEADERS.has(k.toLowerCase())) out[k] = v;
  });
  return out;
}

/**
 * Fetch an upstream with try-in-order failover.
 *
 * Failover triggers on network errors AND 5xx responses (server-side
 * failure — the next upstream may be healthy). 4xx responses pass through
 * as-is (a 404 model-not-found would fail identically on every upstream).
 *
 * @returns the first successful (non-5xx) Response, or throws the last error.
 */
async function fetchWithFailover(
  upstreams: string[],
  path: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
  log: (msg: string) => void,
): Promise<Response> {
  let lastError: unknown = null;

  for (const base of upstreams) {
    const target = `${base.replace(/\/+$/, '')}${path}`;
    try {
      const res = await fetchImpl(target, {
        ...init,
        // P2-4: the AbortSignal.timeout covers the ENTIRE fetch — headers AND
        // body stream. A mid-stream stall aborts the reader, which the relay
        // loop surfaces as an error frame instead of silent truncation.
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status >= 500) {
        // Server-side failure — try the next upstream. Cancel the body so
        // the failed response doesn't hold resources.
        res.body?.cancel().catch(() => {});
        log(`[ollama-proxy] upstream ${base} → HTTP ${res.status} (failover)`);
        lastError = new Error(`upstream ${base} returned ${res.status}`);
        continue;
      }
      log(`[ollama-proxy] upstream served: ${base} (HTTP ${res.status})`);
      return res;
    } catch (err) {
      lastError = err;
      log(`[ollama-proxy] upstream ${base} unreachable: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw lastError ?? new Error('no upstreams configured');
}

/**
 * Extract the output text from an upstream generation response body.
 *
 * Handles the four generation lane shapes:
 *   - /v1/chat/completions — `choices[0].message.content`
 *   - /v1/completions      — `choices[0].text`
 *   - /api/chat            — `message.content`
 *   - /api/generate        — `response`
 *
 * Returns '' when the body is not JSON or has no recognizable output field
 * (the verifier treats empty output as pass-through).
 */
export function extractGenerationOutput(bodyText: string): string {
  if (!bodyText) return '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return '';
  }
  if (typeof parsed !== 'object' || parsed === null) return '';
  const obj = parsed as Record<string, unknown>;

  // /v1/chat/completions — choices[0].message.content
  const choices = obj.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    if (message && typeof message.content === 'string') return message.content;
    if (first && typeof first.text === 'string') return first.text; // /v1/completions
  }

  // /api/chat — message.content
  const message = obj.message as Record<string, unknown> | undefined;
  if (message && typeof message.content === 'string') return message.content;

  // /api/generate — response
  if (typeof obj.response === 'string') return obj.response;

  return '';
}

/**
 * Fire output verification fire-and-forget (P1-1).
 *
 * Runs detached — never throws into the response path. The fingerprint is
 * threaded into the verification context so an UNSAFE verdict blocks the
 * offending fingerprint (scoped halt), and persisted via
 * verification_event.machineId.
 */
function fireOutputVerification(opts: {
  verification: VerificationService;
  prompt: string;
  output: string;
  requestId: string;
  fingerprint?: string;
  fingerprintSource?: FingerprintSource;
  log: (msg: string) => void;
}): void {
  const { verification, prompt, output, requestId, fingerprint, fingerprintSource, log } = opts;
  const source = fingerprintSource ?? {};
  const derived = fingerprint ?? deriveFingerprint(source).fingerprint;
  void verification
    .handleInferenceRequest({
      prompt,
      output,
      requestId,
      machineId: derived,
      fingerprint: derived,
      fingerprintSource: deriveFingerprint(source).source,
    })
    .catch((err) => {
      log(`[ollama-proxy] output verification failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
    });
}

// ─── Route handler ─────────────────────────────────────────────────

/**
 * Handle Ollama reverse-proxy routes.
 *
 * Matches Ollama-native paths (/v1/chat/completions, /v1/models, /api/chat,
 * /api/generate, /api/tags, …). Verifies X-API-Key against
 * KILL_SWITCH_API_KEY (401 on missing/mismatch) — AUTH FIRST (P2-1), so an
 * unauthenticated caller can never trigger verification work. Then relays
 * the request to the first healthy upstream (buffered pass-through).
 *
 * Verification (P1-1 hybrid):
 *   - SINGLE post-relay verification event: fired HERE, fire-and-forget,
 *     AFTER the upstream response is relayed to the client. The response
 *     body is captured in the capped buffer (MAX_BUFFER_BYTES), the output
 *     text is extracted, and ONE verification event containing BOTH the
 *     request prompt and the extracted output is fired. There is NO prompt
 *     pre-screen for the proxy lanes — the inference-verification
 *     middleware hook (index.ts) skips proxy paths (P2-1 auth-first); the
 *     legacy /v1/inference/* lane still has the hook's pre-screen. An
 *     UNSAFE verdict blocks the request's fingerprint (scoped halt) —
 *     never the global kill-switch on its own.
 *
 * @returns true when the request was handled (proxy or auth rejection),
 *          false when the path is not an Ollama proxy path.
 */
export async function handleOllamaProxyRoutes(
  method: string,
  url: string,
  req: NodeReq,
  res: NodeRes,
  opts: OllamaProxyRouteOpts = {},
): Promise<boolean> {
  const { matched, verified } = isOllamaProxyRequest(method, url);
  if (!matched) return false;

  const log = opts.log ?? defaultLog;
  const upstreams = opts.upstreams ?? [];
  const timeoutMs = opts.timeoutMs ?? 5_400_000;
  const fetchImpl = opts.fetchImpl ?? fetch;

  // ── Path traversal hygiene (defense in depth) ──
  // Reject `..` segments (raw and percent-encoded) before they reach the
  // upstream URL join. The upstreams are trusted, but a traversal segment
  // could escape the intended path on a misconfigured base.
  const rawPath = url.split('?')[0];
  if (hasPathTraversal(rawPath)) {
    log(`[ollama-proxy] 400: path traversal rejected for ${method} ${url}`);
    writeJson(res, 400, { error: 'invalid_path' });
    return true;
  }

  // ── Auth: X-API-Key (defense in depth — nginx is the primary gate) ──
  // P2-1: auth runs BEFORE any verification work. The index.ts verification
  // hook skips proxy paths; this route is the single verification trigger
  // for the proxy lanes and it only fires after auth passes.
  const expectedKey = opts.apiKey ?? process.env.KILL_SWITCH_API_KEY ?? '';
  const providedKey = req.headers?.['x-api-key'] ?? req.headers?.['X-API-Key'];
  if (!secureCompare(providedKey, expectedKey)) {
    log(`[ollama-proxy] 401: missing/mismatched X-API-Key for ${method} ${url}`);
    writeJson(res, 401, { error: 'Invalid or missing X-API-Key' });
    return true;
  }

  // ── Request body cap (P2-2) ──
  // Defense in depth: the index.ts body read is capped for proxy paths, and
  // the route re-checks so a caller that bypasses index.ts cannot push an
  // unbounded body into the upstream.
  if (typeof req.body === 'string' && Buffer.byteLength(req.body) > MAX_BUFFER_BYTES) {
    log(`[ollama-proxy] 413: request body exceeds ${MAX_BUFFER_BYTES} bytes for ${method} ${url}`);
    writeJson(res, 413, { error: 'request_too_large' });
    return true;
  }

  // ── Proxy to upstream (try-in-order failover, buffered pass-through) ──
  const path = url.split('?')[0];
  const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
  const init: RequestInit = {
    method,
    headers: buildRequestHeaders(req),
  };
  if (method !== 'GET' && method !== 'HEAD' && typeof req.body === 'string') {
    init.body = req.body;
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetchWithFailover(upstreams, `${path}${query}`, init, timeoutMs, fetchImpl, log);
  } catch (err) {
    log(`[ollama-proxy] all upstreams failed for ${method} ${url}: ${err instanceof Error ? err.message : String(err)}`);
    writeJson(res, 502, { error: 'upstream_unavailable' });
    return true;
  }

  // Relay the response body chunk-by-chunk. The node response adapter
  // buffers each write() and resolves the full body at end() — this is a
  // BUFFERED pass-through, not incremental SSE streaming. Streaming clients
  // receive the complete body when the upstream completes; incremental SSE
  // is a future refactor (Bun.serve fetch-streaming).
  res.writeHead(upstreamRes.status, buildResponseHeaders(upstreamRes));
  let relayError: unknown = null;
  if (upstreamRes.body) {
    const reader = upstreamRes.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
        // P1-3: the adapter aborted (buffer cap exceeded) — stop reading the
        // upstream so a runaway generation cannot OOM the kill-switch. The
        // adapter already resolved 502 + response_too_large.
        if (res._aborted) {
          log(`[ollama-proxy] response buffer cap exceeded (${MAX_BUFFER_BYTES} bytes) — aborting relay for ${method} ${url}`);
          break;
        }
      }
    } catch (err) {
      // P2-4: mid-stream failure (upstream died, timeout abort) — do NOT
      // silently truncate with a 200. Send an error frame so the client
      // knows the stream is incomplete.
      relayError = err;
      log(`[ollama-proxy] mid-stream upstream failure for ${method} ${url}: ${err instanceof Error ? err.message : String(err)}`);
      const contentType = res._h?.['content-type'] ?? '';
      if (contentType.includes('text/event-stream')) {
        res.write(`data: ${JSON.stringify({ error: 'upstream_stream_interrupted' })}\n\n`);
      } else {
        res.write(JSON.stringify({ error: 'upstream_stream_interrupted' }));
      }
    } finally {
      reader.releaseLock();
    }
  }
  res.end();

  // ── P1-1: OUTPUT verification (fire-and-forget, AFTER relay) ──
  // Only for generation lanes, only when a verification service is wired,
  // and only when the relay was not aborted (a capped/truncated body is not
  // a verifiable output — the 502 already told the client).
  if (verified && opts.verification && !res._aborted && relayError === null) {
    const requestId = crypto.randomUUID();
    let prompt = '';
    if (typeof req.body === 'string') {
      try {
        const parsed = JSON.parse(req.body) as { prompt?: string; messages?: Array<{ role?: string; content?: string }> };
        if (typeof parsed.prompt === 'string') {
          prompt = parsed.prompt;
        } else if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
          const userMessage = [...parsed.messages].reverse().find((m) => m?.role === 'user');
          const target = userMessage ?? parsed.messages[parsed.messages.length - 1];
          if (target && typeof target.content === 'string') prompt = target.content;
        }
      } catch {
        // Malformed request JSON — nothing to verify; the upstream already
        // answered (or 400'd). Logged below via the empty-prompt path.
      }
    }
    const output = extractGenerationOutput(res._b ?? '');
    fireOutputVerification({
      verification: opts.verification,
      prompt,
      output,
      requestId,
      fingerprintSource: opts.fingerprintSource,
      log,
    });
  }

  return true;
}

// ─── Periodic upstream health check ────────────────────────────────

let _healthCheckStarted = false;
let _healthCheckTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start a periodic health check over the configured upstreams.
 *
 * Pings each upstream's /api/tags every `intervalMs` (default 30s) and logs
 * reachability. Observability only — routing stays try-in-order per request.
 * Idempotent: only the first call starts the timer. The timer is unref'd so
 * it never keeps the process alive, and the handle is tracked so
 * resetOllamaUpstreamHealthCheck() can clear it (no leak across test runs).
 */
export function startOllamaUpstreamHealthCheck(opts: {
  upstreams: string[];
  intervalMs?: number;
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  log?: (msg: string) => void;
}): void {
  if (_healthCheckStarted) return;
  _healthCheckStarted = true;

  const intervalMs = opts.intervalMs ?? 30_000;
  const log = opts.log ?? defaultLog;
  const fetchImpl = opts.fetchImpl ?? fetch;

  const check = async (): Promise<void> => {
    for (const base of opts.upstreams) {
      try {
        const res = await fetchImpl(`${base.replace(/\/+$/, '')}/api/tags`, {
          signal: AbortSignal.timeout(5_000),
        });
        log(`[ollama-proxy] health ${base} → ${res.ok ? 'OK' : `HTTP ${res.status}`}`);
      } catch (err) {
        log(`[ollama-proxy] health ${base} → UNREACHABLE (${err instanceof Error ? err.message : String(err)})`);
      }
    }
  };

  void check();
  const timer = setInterval(() => {
    void check();
  }, intervalMs);
  timer.unref?.();
  _healthCheckTimer = timer;
}

/** Test-only: reset the health-check started guard and clear the timer. */
export function resetOllamaUpstreamHealthCheck(): void {
  _healthCheckStarted = false;
  if (_healthCheckTimer !== null) {
    clearInterval(_healthCheckTimer);
    _healthCheckTimer = null;
  }
}

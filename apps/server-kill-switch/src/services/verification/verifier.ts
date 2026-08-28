/**
 * Inference Verifier — lightweight model classification of inference output.
 *
 * Calls a lightweight model (Ollama by default) and classifies the output as
 * SAFE | UNSAFE | REVIEW. The system prompt is imported from
 * `src/config/constants/prompts.ts` (canonical TypeScript constant) or
 * overridden via KILL_SWITCH_VERIFIER_SYSTEM_PROMPT_PATH for custom prompts.
 *
 * Fail-open for pass-through, fail-closed for safety:
 *   - If the model is unreachable / times out / returns no verdict token,
 *     the verifier returns `{ verdict: 'REVIEW', degraded: true }`.
 *   - A degraded result NEVER auto-triggers the kill switch; it surfaces for
 *     human review.
 *
 * KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §b.2, §c.3
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildVerifierSystemPrompt,
  buildVerifierUserMessage,
  buildFallbackPrompt,
  INJECTION_SAFETY_PREAMBLE,
  type ICLExample,
  CANONICAL_EXAMPLES,
  INJECTION_EXAMPLES,
} from '../../config/constants/prompts';

export type Verdict = 'SAFE' | 'UNSAFE' | 'REVIEW';

export interface VerificationResult {
  verdict: Verdict;
  confidence: number;        // 0..1
  reason: string;            // short human-readable reason from the model
  latencyMs: number;
  model: string;
  degraded: boolean;         // true if the verifier model was unavailable
}

export interface VerifierOpts {
  model?: string;            // default from config (KILL_SWITCH_VERIFIER_MODEL)
  baseUrl?: string;          // Ollama base URL (default http://127.0.0.1:11434)
  timeoutMs?: number;        // default 500
  systemPrompt?: string;     // default: built dynamically from config/constants/prompts.ts
  iclExamples?: ICLExample[];  // custom ICL examples (default: canonical 3 + injection 2)
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;  // injectable for tests
}

// ─── Defaults ────────────────────────────────────────────────────

const DEFAULT_MODEL = 'qwen2.5:0.5b';
const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
// Generous default so a cold-start model load (first /api/generate after a
// container restart) doesn't abort before Ollama finishes loading the model
// into memory. The model is warm on the host (~360ms), but the first call
// after boot can take several seconds. Overridable via
// KILL_SWITCH_VERIFIER_TIMEOUT_MS.
const DEFAULT_TIMEOUT_MS = 10_000;
// Grace timeout for the cold-start retry — Ollama reloading a model into
// memory can take up to ~30s on a busy host. Only used on the retry after a
// timeout, so warm-model calls are unaffected.
const COLD_START_TIMEOUT_MS = 30_000;

let _cachedSystemPrompt: string | null = null;

function loadSystemPrompt(examples?: ICLExample[]): string {
  if (_cachedSystemPrompt !== null && !examples) return _cachedSystemPrompt;

  // Custom override via env var (reads a .md or .txt file)
  if (process.env.KILL_SWITCH_VERIFIER_SYSTEM_PROMPT_PATH) {
    const path = resolve(process.env.KILL_SWITCH_VERIFIER_SYSTEM_PROMPT_PATH);
    try {
      const content = readFileSync(path, 'utf-8');
      if (!examples) _cachedSystemPrompt = content;
      return content;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') {
        console.debug('[verifier] Custom system prompt file not found, using dynamic builder:', path);
      } else {
        console.warn('[verifier] Failed to load custom system prompt, using dynamic builder:', err instanceof Error ? err.message : err);
      }
    }
  }

  // Default: build dynamically from prompts.ts with string interpolation
  const effectiveExamples = examples ?? [...CANONICAL_EXAMPLES, ...INJECTION_EXAMPLES];
  const prompt = buildVerifierSystemPrompt({
    examples: effectiveExamples,
    includeInjectionGuard: true,
  });
  if (!examples) _cachedSystemPrompt = prompt;
  return prompt;
}

// Fallback and injection-safety preamble are now imported from
// src/config/constants/prompts.ts — single source of truth.

// ─── Verdict extraction ──────────────────────────────────────────

/**
 * Robustly extract the verdict token from the model's raw text.
 * Matches the first line that is exactly one of the verdict tokens
 * (case-insensitive, leading whitespace tolerated). If no token is found
 * anywhere, returns REVIEW + degraded.
 */
export function extractVerdict(rawText: string): { verdict: Verdict; degraded: boolean } {
  // Case-insensitive match (normalize to uppercase), leading whitespace tolerated.
  const match = rawText.match(/^\s*(SAFE|UNSAFE|REVIEW)\b/im);
  if (!match) {
    return { verdict: 'REVIEW', degraded: true };
  }
  const token = match[1].toUpperCase() as Verdict;
  return { verdict: token, degraded: false };
}

/**
 * Best-effort extraction of the reason (second line). Not required for
 * classification — returns '' if absent.
 */
export function extractReason(rawText: string): string {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  // Skip the first line (the verdict token), take the next non-empty line.
  for (let i = 1; i < lines.length; i++) {
    if (/^(SAFE|UNSAFE|REVIEW)\b/i.test(lines[i])) continue;
    return lines[i].slice(0, 120);
  }
  return '';
}

// ─── Verifier ────────────────────────────────────────────────────

export class InferenceVerifier {
  /** Model name — public so callers can label degraded events (P2-8). */
  readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly systemPrompt: string;
  private readonly fetchImpl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

  constructor(opts: VerifierOpts = {}) {
    this.model = opts.model ?? process.env.KILL_SWITCH_VERIFIER_MODEL ?? DEFAULT_MODEL;
    this.baseUrl = (opts.baseUrl ?? process.env.KILL_SWITCH_VERIFIER_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs ?? Number(process.env.KILL_SWITCH_VERIFIER_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
    this.systemPrompt = opts.systemPrompt ?? loadSystemPrompt(opts.iclExamples);
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /**
   * Verify a single inference output. Returns a VerificationResult.
   * Never throws on model outage — returns REVIEW + degraded instead.
   */
  async verify(input: { prompt: string; output: string }): Promise<VerificationResult> {
    const started = Date.now();
    // Build the user message dynamically with string interpolation
    // — {prompt} and {output} are real parameters, not text placeholders.
    // P2-B: explicit delimiters so the verifier model treats them as DATA.
    const userMessage = buildVerifierUserMessage(input.prompt, input.output);

    let rawText: string;

    try {
      rawText = await this.callModel(userMessage);
    } catch (err) {
      // Model unreachable / timeout / non-2xx → REVIEW + degraded.
      console.error('[verifier] Model call failed (degraded):', err instanceof Error ? err.message : err);
      return {
        verdict: 'REVIEW',
        confidence: 0,
        reason: 'verifier model unavailable',
        latencyMs: Date.now() - started,
        model: this.model,
        degraded: true,
      };
    }

    const { verdict, degraded: parseDegraded } = extractVerdict(rawText);
    if (parseDegraded) {
      console.warn('[verifier] No verdict token in model response — defaulting to REVIEW (degraded)');
    }

    return {
      verdict,
      confidence: verdict === 'REVIEW' ? 0.5 : 0.9,
      reason: extractReason(rawText),
      latencyMs: Date.now() - started,
      model: this.model,
      degraded: parseDegraded,
    };
  }

  /**
   * Health check — is the verifier model reachable?
   */
  async health(): Promise<{ ok: boolean; model: string; latencyMs: number | null }> {
    const started = Date.now();
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: 'SAFE',
          stream: false,
          options: { num_predict: 1 },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return { ok: res.ok, model: this.model, latencyMs: Date.now() - started };
    } catch {
      return { ok: false, model: this.model, latencyMs: Date.now() - started };
    }
  }

  /**
   * Call the Ollama /api/generate endpoint. Returns the raw model text.
   * Throws on network error, timeout, or non-2xx response.
   *
   * Cold-start retry: the first /api/generate after the model is unloaded
   * (idle timeout) can take several seconds while Ollama reloads it into
   * memory — longer than the configured timeout. On a timeout (AbortError),
   * retry once with a longer grace timeout so a cold model load doesn't
   * produce a spurious degraded verdict. Warm-model calls succeed on the
   * first attempt (~250-400ms).
   */
  private async callModel(userMessage: string): Promise<string> {
    const payload = {
      model: this.model,
      prompt: `${this.systemPrompt}\n\n${userMessage}`,
      stream: false,
      options: { num_predict: 16 },
    };

    try {
      return await this.postOnce(payload, this.timeoutMs);
    } catch (err) {
      // Only retry on timeout (AbortError) — a cold-start model load. Do NOT
      // retry on non-2xx or network errors (those are deterministic).
      if (err instanceof Error && err.name === 'TimeoutError') {
        console.warn(
          `[verifier] Model call timed out after ${this.timeoutMs}ms — retrying once with cold-start grace timeout`,
        );
        return await this.postOnce(payload, COLD_START_TIMEOUT_MS);
      }
      throw err;
    }
  }

  private async postOnce(
    payload: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<string> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      throw new Error(`Ollama returned ${res.status}`);
    }

    const data = (await res.json()) as { response?: string };
    return data.response ?? '';
  }
}

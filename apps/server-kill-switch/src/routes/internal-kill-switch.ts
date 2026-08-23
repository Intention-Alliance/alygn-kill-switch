/**
 * Internal Kill-Switch Transition Route — automated (non-human) STOPPED triggers.
 *
 * KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §d.1, ADR-136 extension.
 *
 * ADR-136 gates `/v1/kill-switch/chaos` behind a human WebAuthn assertion.
 * Automated systems (the inference verifier, the telemetry bridge) must be
 * able to STOP the system without a human in the loop — that is their entire
 * purpose. This endpoint is a deliberate, documented extension of ADR-136:
 *
 *   - Loopback-only (like the existing /v1/internal/* webhook routes),
 *     authenticated by KILL_SWITCH_INTERNAL_KEY.
 *   - Accepts ONLY STOPPING / STOPPED. Automated systems can pause, never
 *     resume/arm — resume/arm stays human-only (defense against autonomous
 *     self-deactivation).
 *   - Every transition is audited with `initiatedBy: 'system:verifier'` (or
 *     `system:telemetry`) and a machineId/reason in metadata, so the audit
 *     log distinguishes automated from human kills.
 */

import type { KillSwitchState } from '@align/shared-types';
import type { KillSwitchService } from '../services/kill-switch';
import { secureCompare } from '../utils/secure-compare';

const ALLOWED_AUTOMATED_STATES: KillSwitchState[] = ['STOPPING', 'STOPPED'];

// ─── In-memory sliding-window rate limiter (P2-C) ────────────────
// The internal transition endpoint is key-gated but had no rate limiter,
// unlike the /v1/internal/api-keys/* routes. A leaked/compromised
// KILL_SWITCH_INTERNAL_KEY could hammer the endpoint. This is a simple
// in-memory sliding-window limiter (no Redis dependency) — max 10
// transitions per 60s per IP. Exceeding it returns 429.
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

const _rateBuckets = new Map<string, number[]>();

/**
 * Sliding-window rate check. Returns true if the request is allowed,
 * false if it exceeds the limit. Prunes stale timestamps on each call.
 */
function checkTransitionRateLimit(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const bucket = _rateBuckets.get(ip) ?? [];

  // Drop timestamps outside the window.
  const fresh = bucket.filter((t) => t > cutoff);

  if (fresh.length >= RATE_LIMIT_MAX) {
    _rateBuckets.set(ip, fresh);
    return false;
  }

  fresh.push(now);
  _rateBuckets.set(ip, fresh);
  return true;
}

/**
 * Reset the rate limiter state. Exposed for tests.
 */
export function resetTransitionRateLimiter(): void {
  _rateBuckets.clear();
}

interface Req {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  ip: string;
}

interface Res {
  writeHead: (status: number, headers?: Record<string, string>) => void;
  end: (data?: string) => void;
}

function writeJson(res: Res, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function internalKeyMatches(req: Req): boolean {
  const expected = process.env.KILL_SWITCH_INTERNAL_KEY;
  if (!expected) return false;
  const hdr = req.headers?.['x-internal-key'] || req.headers?.['X-Internal-Key'];
  if (typeof hdr === 'string' && secureCompare(hdr, expected)) return true;
  const auth = req.headers?.authorization || '';
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  if (m && secureCompare(m[1], expected)) return true;
  return false;
}

/**
 * True if the request carries ANY internal credential (header or bearer).
 * Used to distinguish 401 (no credential) from 403 (wrong credential).
 */
function hasInternalCredential(req: Req): boolean {
  const hdr = req.headers?.['x-internal-key'] || req.headers?.['X-Internal-Key'];
  if (typeof hdr === 'string' && hdr.length > 0) return true;
  const auth = req.headers?.authorization || '';
  return /^Bearer\s+.+$/i.test(String(auth));
}

/**
 * POST /v1/internal/kill-switch/transition
 * body: { state: 'STOPPING' | 'STOPPED', reason?, machineId?, initiatedBy? }
 *
 * Returns true if handled, false if not for us.
 */
export async function handleInternalKillSwitchRoutes(
  method: string,
  url: string,
  req: Req,
  res: Res,
  service: KillSwitchService,
): Promise<boolean> {
  const path = url.split('?')[0];
  if (path !== '/v1/internal/kill-switch/transition') return false;

  if (method !== 'POST') {
    writeJson(res, 405, { error: 'method not allowed' });
    return true;
  }

  if (!internalKeyMatches(req)) {
    // 401 when no credential is supplied, 403 when a wrong credential is.
    writeJson(res, hasInternalCredential(req) ? 403 : 401, { error: 'unauthorized' });
    return true;
  }

  // P2-C: rate limit — max 10 transitions per 60s per IP.
  if (!checkTransitionRateLimit(req.ip || 'unknown')) {
    writeJson(res, 429, {
      error: 'rate limit exceeded',
      retryAfter: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
    });
    return true;
  }

  let body: Record<string, unknown> = {};
  try {
    body = req.body ? JSON.parse(req.body) : {};
  } catch {
    body = {};
  }

  const target = body.state;
  if (typeof target !== 'string' || !ALLOWED_AUTOMATED_STATES.includes(target as KillSwitchState)) {
    writeJson(res, 400, {
      error: `state must be one of: ${ALLOWED_AUTOMATED_STATES.join(', ')}. Automated systems can only pause (STOPPING/STOPPED); resume/arm is human-only.`,
    });
    return true;
  }

  const initiatedBy =
    typeof body.initiatedBy === 'string' && body.initiatedBy.startsWith('system:')
      ? body.initiatedBy
      : 'system:verifier';
  const reason = typeof body.reason === 'string' ? body.reason : 'automated-stop';
  const machineId = typeof body.machineId === 'string' ? body.machineId : undefined;

  try {
    const entry = await service.transitionTo(target as KillSwitchState, {
      reason,
      userId: initiatedBy,
      ip: 'internal',
      machineId,
    });

    writeJson(res, 200, {
      ok: true,
      previousState: entry.previousState,
      newState: entry.newState,
      initiatedBy,
      reason,
      machineId: machineId ?? null,
      traceId: entry.traceId,
    });
    return true;
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string; current?: string; allowed?: string[] };
    if (e.statusCode === 409) {
      writeJson(res, 409, {
        error: e.message,
        current: e.current,
        allowed: e.allowed,
      });
      return true;
    }
    console.error('[internal-kill-switch] Transition failed:', err instanceof Error ? err.message : err);
    writeJson(res, 500, { error: 'internal_error' });
    return true;
  }
}

// Kill Switch routes — Status, activate, health

import { STATES } from '../services/kill-switch';
import type { KillSwitchService } from '../services/kill-switch';
import { getPausedRequestCount } from '../services/traffic-pause';
import { parseBody } from '../utils/body-parser';
import { verifyAssertionTokenForAction, WebAuthnError } from '../services/webauthn';
import { killActionForTarget } from './kill-authorization';
import { checkAuth } from '../middleware/auth';

/**
 * Extract and verify the WebAuthn assertion token required for kill
 * authorization (ADR-136). The token must be bound to the exact kill
 * action being requested. Bearer tokens / API keys are structurally
 * rejected here — only a human WebAuthn assertion can authorize a kill
 * (ADR-136 §4 defense against autonomous self-deactivation).
 *
 * Returns the verified identity, or `null` when NO assertion header is
 * present (so the caller can fall back to the dashboard's cookie-based
 * session auth). Throws when an assertion IS present but invalid.
 */
function requireKillAssertion(req: any, target: string): { userId: string; credentialId: string } | null {
  const header = req.headers?.['authorization'] ?? '';
  if (!header.startsWith('Assertion ')) {
    return null;
  }
  const token = header.slice('Assertion '.length).trim();
  if (!token) {
    const err = new Error('Empty assertion token');
    (err as any).statusCode = 403;
    (err as any).code = 'ASSERTION_REQUIRED';
    throw err;
  }
  try {
    return verifyAssertionTokenForAction({ token, action: killActionForTarget(target) });
  } catch (err: any) {
    if (err instanceof WebAuthnError) {
      const wrapped = new Error(err.message);
      (wrapped as any).statusCode = 403;
      (wrapped as any).code = err.code;
      throw wrapped;
    }
    throw err;
  }
}

export async function handleKillSwitchRoutes(
  method: string,
  url: string,
  req: any,
  res: any,
  service: KillSwitchService,
  ip: string,
): Promise<boolean> {
  try {
    // GET /v1/kill-switch/activations
    if (method === 'GET' && url.startsWith('/v1/kill-switch/activations')) {
      const parsedUrl = new URL(url, 'http://localhost');
      const limit = parseInt(parsedUrl.searchParams.get('limit') || '50', 10);
      const activations = service.getAuditLog(limit);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: activations, total: activations.length, page: 1, limit }));
      return true;
    }

    // GET /v1/kill-switch/status
    if (method === 'GET' && url === '/v1/kill-switch/status') {
      const state = await service.getCurrentState();
      const lastActivation = service.getLastActivation();
      const recentTransitions = service.getAuditLog(10);

      // Return full KillSwitchStatus matching @align/shared-types
      const status = {
        state,
        lastActivation: lastActivation.timestamp,
        lastActivationBy: lastActivation.by,
        activeExperiments: 0, // No experiment tracking yet
        activatedAt: lastActivation.timestamp,
        reason: lastActivation.reason,
        recentTransitions,
        // ADR-141: expose the paused-request counter so the dashboard can
        // surface how many inference requests were rejected while paused.
        pausedRequestCount: getPausedRequestCount(),
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status));
      return true;
    }

    // GET /v1/kill-switch/health
    if (method === 'GET' && url === '/v1/kill-switch/health') {
      const health = await service.healthCheck();
      res.writeHead(health.status === 'healthy' ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health));
      return true;
    }

    // POST /v1/kill-switch/chaos — ADR-136: prefers a human WebAuthn
    // assertion token bound to the kill action. Falls back to the
    // dashboard's cookie-based session auth (super-admin) so the web
    // regulator can trigger kill/stop without a WebAuthn round-trip.
    // The legacy Bearer token path is REMOVED for this endpoint (kept for
    // non-kill routes).
    if (method === 'POST' && url === '/v1/kill-switch/chaos') {
      const body = await parseBody(req);

      if (!body.state || !Object.values(STATES).includes(body.state)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Invalid state',
          validStates: Object.values(STATES),
        }));
        return true;
      }

      const target = body.target && typeof body.target === 'string' ? body.target : 'fleet';

      // 1. Preferred path: WebAuthn assertion (external API callers).
      const assertion = requireKillAssertion(req, target);
      let userId: string;
      if (assertion) {
        userId = assertion.userId;
      } else {
        // 2. Fallback path: dashboard cookie-based session (super-admin).
        // The dashboard is already behind super-admin auth + Tailscale, so
        // a valid admin session is sufficient to authorize a kill/stop.
        const ar = await checkAuth(service, req);
        if (!ar.authenticated || ar.user?.role !== 'admin') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Kill authorization requires a WebAuthn assertion token or an authenticated admin session',
            code: 'ASSERTION_REQUIRED',
          }));
          return true;
        }
        userId = ar.user.email;
      }

      const result = await service.transitionTo(body.state, {
        userId,
        reason: body.reason || 'API request',
        ip,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    }

    return false;
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: err.message,
      code: err.code,
      current: err.current,
      allowed: err.allowed,
    }));
    return true;
  }
}
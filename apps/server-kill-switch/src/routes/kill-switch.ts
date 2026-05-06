// Kill Switch routes — Status, activate, health

import { STATES } from '../services/kill-switch';
import type { KillSwitchService } from '../services/kill-switch';
import { parseBody } from '../utils/body-parser';

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

    // POST /v1/kill-switch/chaos
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

      const result = await service.transitionTo(body.state, {
        userId: body.userId || 'api',
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
      current: err.current,
      allowed: err.allowed,
    }));
    return true;
  }
}
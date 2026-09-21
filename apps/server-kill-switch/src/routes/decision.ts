/**
 * POST /v1/decision — server-side decision endpoint (S3, BE-PLAN §2.5 Option A).
 *
 * The interceptor runs on guarded machines where the TypeSafe key must NOT
 * exist. When decision.provider=jev, the agent-plane calls this endpoint and
 * the mother (which holds the key) performs the decision.
 *
 * Auth: x-api-key (same posture as POST /v1/inference-logs).
 * Never returns the api key or any upstream error body.
 */

import type { DecisionInput, DecisionFlagReader } from '@align/shared-types';
import { decideWithProvider, type ProviderRegistry } from '@align/decision-core';
import { buildServerRegistry, readDecisionFlags } from '../services/decision';
import { parseBody } from '../utils/body-parser';

const MAX_TEXT_BYTES = 256 * 1024;

/** Injectable dependencies — lets tests avoid process-wide mock.module. */
export interface DecisionRouteDeps {
  registry?: ProviderRegistry;
  flagsReader?: (machineId: string) => Promise<DecisionFlagReader>;
}

function json(res: any, statusCode: number, body: Record<string, unknown>) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export async function handleDecisionRoutes(
  method: string,
  url: string,
  req: any,
  res: any,
  uid: string | null,
  deps?: DecisionRouteDeps,
): Promise<boolean> {
  if (!url.startsWith('/v1/decision')) return false;

  try {
    if (method !== 'POST' || url.split('?')[0] !== '/v1/decision') return false;

    if (!uid) {
      json(res, 401, { error: 'Authentication required' });
      return true;
    }

    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      json(res, 400, { error: 'Request body required' });
      return true;
    }

    const kind = body.kind;
    if (kind !== 'prompt' && kind !== 'output') {
      json(res, 400, { error: "kind must be 'prompt' or 'output'" });
      return true;
    }
    if (typeof body.text !== 'string') {
      json(res, 400, { error: 'text must be a string' });
      return true;
    }
    if (body.text.length > MAX_TEXT_BYTES) {
      json(res, 400, { error: `text exceeds ${MAX_TEXT_BYTES} bytes` });
      return true;
    }
    if (typeof body.machineId !== 'string' || body.machineId.trim().length === 0) {
      json(res, 400, { error: 'machineId is required' });
      return true;
    }

    const input: DecisionInput = {
      kind,
      text: body.text,
      model: typeof body.model === 'string' ? body.model : undefined,
      machineId: body.machineId,
      prompt: typeof body.prompt === 'string' ? body.prompt : undefined,
    };

    const flagsReader = deps?.flagsReader ?? readDecisionFlags;
    const flags = await flagsReader(input.machineId);
    const registry = deps?.registry ?? buildServerRegistry();
    const result = await decideWithProvider(input, flags, registry);

    json(res, 200, result as unknown as Record<string, unknown>);
    return true;
  } catch (err: any) {
    console.error('[decision] Error:', err?.message ?? err);
    json(res, 500, { error: 'Internal server error' });
    return true;
  }
}

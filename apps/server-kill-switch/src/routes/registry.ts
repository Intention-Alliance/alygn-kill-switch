/**
 * Registry Routes — dashboard-facing live registry overview.
 *
 * KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §a.4.
 *
 * A small read-only surface for the dashboard so it can render the live
 * registry without hitting the raw discovery tables. Consolidates machines +
 * agents + providers + models + online/offline counts in one payload.
 *
 * GET /v1/registry/overview
 *   Returns: { machines, agents, providers, models, onlineCount, offlineCount }
 *
 * Online/offline is computed on read from `lastSeen` (single source of truth):
 *   - Online  = lastSeen within heartbeatTimeoutMs (default 90s)
 *   - Offline = lastSeen older than heartbeatTimeoutMs
 */

import { desc } from 'drizzle-orm';
import { db } from '../db';
import { agents, discoveredMachines, discoveredModels, discoveredProviders } from '../db/schema';

const DEFAULT_HEARTBEAT_TIMEOUT_MS = 90_000;

interface Res {
  writeHead: (status: number, headers?: Record<string, string>) => void;
  end: (data?: string) => void;
}

function writeJson(res: Res, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function toIso(v: Date | number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(Number(v)).toISOString();
}

/**
 * GET /v1/registry/overview — consolidated live registry view.
 */
export async function handleRegistryRoutes(
  method: string,
  url: string,
  res: Res,
): Promise<boolean> {
  const path = url.split('?')[0];
  if (path !== '/v1/registry/overview') return false;

  if (method !== 'GET') {
    writeJson(res, 405, { error: 'method not allowed' });
    return true;
  }

  const heartbeatTimeoutMs = Number(process.env.KILL_SWITCH_HEARTBEAT_TIMEOUT_MS ?? DEFAULT_HEARTBEAT_TIMEOUT_MS);
  const cutoff = Date.now() - heartbeatTimeoutMs;

  const [machineRows, agentRows, providerRows, modelRows] = await Promise.all([
    db.select().from(discoveredMachines).orderBy(desc(discoveredMachines.lastSeen)).all(),
    db.select().from(agents).orderBy(desc(agents.lastHeartbeat)).all(),
    db.select().from(discoveredProviders).all(),
    db.select().from(discoveredModels).all(),
  ]);

  const machines = machineRows.map((row) => {
    const lastSeen = row.lastSeen instanceof Date ? row.lastSeen.getTime() : Number(row.lastSeen);
    const online = lastSeen >= cutoff;
    return {
      id: String(row.id),
      hostname: String(row.hostname),
      ip: row.ip ? String(row.ip) : null,
      source: String(row.source),
      state: String(row.state),
      online,
      lastSeen: toIso(row.lastSeen),
      firstSeen: toIso(row.firstSeen),
      confirmedAt: toIso(row.confirmedAt),
      confirmedBy: row.confirmedBy ? String(row.confirmedBy) : null,
    };
  });

  const agentsList = agentRows.map((row) => ({
    id: String(row.id),
    machineId: String(row.machineId),
    name: String(row.name),
    version: String(row.version),
    capabilities: row.capabilities ? (JSON.parse(String(row.capabilities)) as string[]) : [],
    lastHeartbeat: toIso(row.lastHeartbeat),
  }));

  const providers = providerRows.map((row) => ({
    id: String(row.id),
    machineId: String(row.machineId),
    providerId: String(row.providerId),
    baseUrl: row.baseUrl ? String(row.baseUrl) : null,
    version: row.version ? String(row.version) : null,
    status: String(row.status),
    lastHealthyAt: toIso(row.lastHealthyAt),
  }));

  const models = modelRows.map((row) => ({
    id: String(row.id),
    machineId: String(row.machineId),
    providerId: String(row.providerId),
    modelId: String(row.modelId),
    name: String(row.name),
    sizeBytes: row.sizeBytes !== null ? Number(row.sizeBytes) : null,
    quantization: row.quantization ? String(row.quantization) : null,
    family: row.family ? String(row.family) : null,
    served: Boolean(row.served),
  }));

  const onlineCount = machines.filter((m) => m.online).length;
  const offlineCount = machines.length - onlineCount;

  writeJson(res, 200, {
    machines,
    agents: agentsList,
    providers,
    models,
    onlineCount,
    offlineCount,
    heartbeatTimeoutMs,
    timestamp: new Date().toISOString(),
  });
  return true;
}

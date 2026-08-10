/**
 * Machines API — CRUD + Heartbeat + Status
 *
 * Endpoints:
 *   GET    /v1/machines              — List all machines
 *   POST   /v1/machines/register     — Register new machine
 *   GET    /v1/machines/:id          — Get machine by ID
 *   PATCH  /v1/machines/:id          — Update machine
 *   DELETE /v1/machines/:id          — Remove machine
 *   POST   /v1/machines/:id/heartbeat — Machine heartbeat
 *   GET    /v1/machines/:id/status   — Machine status + DPU info
 *
 * ADR-133: Kill Switch dashboard rebuild — machine inventory.
 * Publishes machine events to bcp:machines:events Redis channel.
 */

import { eq, ne, desc, asc, and } from 'drizzle-orm';
import { db } from '../db/index';
import { machines, machineFlags, agents, featureFlags, killSwitchAuditLog } from '../db/schema';
import { getMachineMetrics, collectSystemMetrics } from '../services/system-metrics';
import type { Machine, MachineSpecs, MachineStatus, DpuInfo, AgentInfo, ActiveFlagInfo } from '@align/shared-types';

// ─── Helpers ────────────────────────────────────────────────────────

function json(res: any, statusCode: number, body: unknown) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function parseJsonBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : null); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function validateName(name: string): string | null {
  if (!name || typeof name !== 'string') return 'name is required';
  if (name.length < 1 || name.length > 64) return 'name must be 1-64 characters';
  if (!/^[a-zA-Z0-9-]+$/.test(name)) return 'name must be alphanumeric + hyphens only';
  return null;
}

function validateHostname(hostname: string): string | null {
  if (!hostname || typeof hostname !== 'string') return 'hostname is required';
  if (hostname.length < 1 || hostname.length > 255) return 'hostname must be 1-255 characters';
  // Allow standard hostnames + Tailscale magic DNS
  if (!/^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(hostname)) return 'invalid hostname format';
  return null;
}

function validateRole(role: string): string | null {
  if (!role || typeof role !== 'string') return 'role is required';
  if (role.length < 1 || role.length > 32) return 'role must be 1-32 characters';
  return null;
}

function serializeMachine(row: any): Machine {
  const specs = row.specs ? (typeof row.specs === 'string' ? JSON.parse(row.specs) : row.specs) : null;
  const metrics = getMachineMetrics(row.id);
  return {
    id: row.id,
    name: row.name,
    hostname: row.hostname,
    status: row.status as MachineStatus,
    role: row.role,
    lastSeen: row.lastSeen ? new Date(row.lastSeen).toISOString() : '',
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    hasDpu: Boolean(row.hasDpu),
    specs: specs || { cpu: '', ram: '', gpu: '', dpu: null },
    cpuUsage: metrics.cpuUsage,
    memoryUsage: metrics.memoryUsage,
    // ADR-138: monitoring-only + zone are part of the machine tenant contract.
    monitoringOnly: row.monitoringOnly !== undefined ? Boolean(row.monitoringOnly) : undefined,
    zone: row.zone !== undefined ? String(row.zone) : undefined,
  };
}

// ─── Route Handler ──────────────────────────────────────────────────

export async function handleMachinesRoutes(
  method: string,
  url: string,
  req: any,
  res: any,
  publishEvent?: (channel: string, message: string) => Promise<void>,
): Promise<boolean> {
  if (!url.startsWith('/v1/machines')) return false;

  try {
    // ─── GET /v1/machines — List all machines ───────────────────────
    if (method === 'GET' && (url === '/v1/machines' || url === '/v1/machines/')) {
      const parsed = new URL(url, 'http://localhost');
      const statusFilter = parsed.searchParams.get('status');
      const sortBy = parsed.searchParams.get('sortBy') || 'lastSeen';
      const order = (parsed.searchParams.get('order') || 'desc').toLowerCase();
      const limit = parseInt(parsed.searchParams.get('limit') || '50', 10);
      const offset = parseInt(parsed.searchParams.get('offset') || '0', 10);

      // Map sortBy to column
      const sortColumns: Record<string, any> = {
        name: machines.name,
        status: machines.status,
        lastSeen: machines.lastSeen,
        createdAt: machines.createdAt,
        role: machines.role,
      };
      const sortCol = sortColumns[sortBy] || machines.lastSeen;

      let query = db.select().from(machines).$dynamic();

      if (statusFilter && ['active', 'inactive', 'offline'].includes(statusFilter)) {
        query = query.where(eq(machines.status, statusFilter));
      }

      const results = await query
        .orderBy(order === 'asc' ? asc(sortCol) : desc(sortCol))
        .limit(limit)
        .offset(offset)
        .all();

      // Get total count
      let countQuery = db.select().from(machines).$dynamic();
      if (statusFilter && ['active', 'inactive', 'offline'].includes(statusFilter)) {
        countQuery = countQuery.where(eq(machines.status, statusFilter));
      }
      const allForCount = await countQuery.all();

      const data = results.map(serializeMachine);
      json(res, 200, { data, total: allForCount.length, limit, offset });
      return true;
    }

    // ─── POST /v1/machines/register — Register new machine ──────────
    if (method === 'POST' && url === '/v1/machines/register') {
      const body = await parseJsonBody(req);

      const nameErr = validateName(body?.name);
      if (nameErr) { json(res, 400, { error: nameErr }); return true; }

      const hostnameErr = validateHostname(body?.hostname);
      if (hostnameErr) { json(res, 400, { error: hostnameErr }); return true; }

      const roleErr = validateRole(body?.role);
      if (roleErr) { json(res, 400, { error: roleErr }); return true; }

      // Check for duplicate hostname
      const existing = await db
        .select({ id: machines.id })
        .from(machines)
        .where(eq(machines.hostname, body.hostname))
        .get();

      if (existing) {
        json(res, 409, { error: 'Hostname already registered', hostname: body.hostname });
        return true;
      }

      const now = new Date();
      const machineId = `machine-${body.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-${Date.now().toString(36)}`;

      await db.insert(machines).values({
        id: machineId,
        name: body.name,
        hostname: body.hostname,
        status: 'active',
        role: body.role,
        hasDpu: Boolean(body.hasDpu ?? false),
        specs: body.specs ? JSON.stringify(body.specs) : null,
        lastSeen: now,
        createdAt: now,
      });

      const created = await db
        .select()
        .from(machines)
        .where(eq(machines.id, machineId))
        .get();

      // Publish to Redis
      if (publishEvent) {
        await publishEvent('bcp:machines:events', JSON.stringify({
          type: 'machine-registered',
          payload: serializeMachine(created),
        }));
      }

      json(res, 201, serializeMachine(created));
      return true;
    }

    // ─── POST /v1/machines/:id/heartbeat — Machine heartbeat ────────
    const heartbeatMatch = url.match(/^\/v1\/machines\/([^/]+)\/heartbeat$/);
    if (method === 'POST' && heartbeatMatch) {
      const id = heartbeatMatch[1];

      const existing = await db
        .select()
        .from(machines)
        .where(eq(machines.id, id))
        .get();

      if (!existing) {
        json(res, 404, { error: 'Machine not found', id });
        return true;
      }

      const body = await parseJsonBody(req);
      const now = new Date();

      await db.update(machines)
        .set({
          lastSeen: now,
          status: 'active', // Heartbeat always sets status to active
        })
        .where(eq(machines.id, id));

      // Optionally log CPU/memory in audit log as metadata
      if (body?.cpuUsage !== undefined || body?.memoryUsage !== undefined) {
        // We'd log to kill_switch_audit_log but keeping it simple for now
      }

      // If agent version info provided, update/upsert agent
      if (body?.agentName && body?.agentVersion) {
        const agentRow = await db
          .select()
          .from(agents)
          .where(and(eq(agents.machineId, id), eq(agents.name, body.agentName)))
          .get();

        if (agentRow) {
          await db.update(agents)
            .set({
              version: body.agentVersion,
              lastHeartbeat: now,
            })
            .where(eq(agents.id, agentRow.id));
        } else {
          await db.insert(agents).values({
            id: crypto.randomUUID(),
            machineId: id,
            name: body.agentName,
            version: body.agentVersion,
            capabilities: body.agentCapabilities ? JSON.stringify(body.agentCapabilities) : null,
            lastHeartbeat: now,
            createdAt: now,
          });
        }
      }

      // Publish to Redis
      if (publishEvent) {
        await publishEvent('bcp:machines:events', JSON.stringify({
          type: 'machine-heartbeat',
          payload: { machineId: id, timestamp: now.toISOString() },
        }));
      }

      json(res, 200, {
        acknowledged: true,
        machineId: id,
        timestamp: now.toISOString(),
      });
      return true;
    }

    // ─── GET /v1/machines/:id/status — Machine status + DPU ──────────
    const statusMatch = url.match(/^\/v1\/machines\/([^/]+)\/status$/);
    if (method === 'GET' && statusMatch) {
      const id = statusMatch[1];

      const machine = await db
        .select()
        .from(machines)
        .where(eq(machines.id, id))
        .get();

      if (!machine) {
        json(res, 404, { error: 'Machine not found', id });
        return true;
      }

      // Get agents
      const machineAgents = await db
        .select()
        .from(agents)
        .where(eq(agents.machineId, id))
        .all();

      const agentList: AgentInfo[] = machineAgents.map((a: any) => ({
        id: a.id,
        machineId: a.machineId,
        name: a.name,
        version: a.version,
        capabilities: a.capabilities ? JSON.parse(a.capabilities) : [],
        lastHeartbeat: a.lastHeartbeat ? new Date(a.lastHeartbeat).toISOString() : null,
        createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : '',
      }));

      // Get machine-specific flags
      const machineFlagRows = await db
        .select()
        .from(machineFlags)
        .where(eq(machineFlags.machineId, id))
        .all();

      const machineFlagKeys = new Set(machineFlagRows.map((f: any) => f.flagKey));

      // Get global flags
      const globalFlags = await db
        .select()
        .from(featureFlags)
        .all();

      // Merge flags: machine overrides take precedence
      const activeFlags: ActiveFlagInfo[] = [];
      for (const gf of globalFlags) {
        const mf = machineFlagRows.find((f: any) => f.flagKey === gf.key);
        if (mf) {
          activeFlags.push({
            key: gf.key,
            value: mf.value ?? String(gf.value),
            source: 'machine',
            machineId: id,
          });
        } else {
          activeFlags.push({
            key: gf.key,
            value: String(gf.value),
            source: 'global',
          });
        }
      }

      // Add any machine-only flags not in global
      for (const mf of machineFlagRows) {
        if (!globalFlags.some((gf: any) => gf.key === mf.flagKey)) {
          activeFlags.push({
            key: mf.flagKey,
            value: mf.value ?? '',
            source: 'machine',
            machineId: id,
          });
        }
      }

      // DPU info
      const specs = machine.specs ? JSON.parse(machine.specs) : {};
      const dpu: DpuInfo = {
        available: Boolean(machine.hasDpu),
        type: specs.dpu || null,
        version: null,
        status: machine.hasDpu ? 'active' : 'inactive',
      };

      json(res, 200, {
        machine: {
          id: machine.id,
          name: machine.name,
          status: machine.status,
          lastSeen: machine.lastSeen ? new Date(machine.lastSeen).toISOString() : null,
        },
        dpu,
        agents: agentList,
        activeFlags,
      });
      return true;
    }

    // ─── GET /v1/machines/:id/metrics — Real-time system metrics ──
    const metricsMatch = url.match(/^\/v1\/machines\/([^/]+)\/metrics$/);
    if (method === 'GET' && metricsMatch) {
      const id = metricsMatch[1];

      const machine = await db
        .select({ id: machines.id })
        .from(machines)
        .where(eq(machines.id, id))
        .get();

      if (!machine) {
        json(res, 404, { error: 'Machine not found', id });
        return true;
      }

      // Collect live system metrics from the host (real telemetry)
      const metrics = await collectSystemMetrics();
      json(res, 200, {
        cpuUsage: metrics.cpuUsage,
        memoryUsage: metrics.memoryUsage,
        gpuUsage: metrics.gpuUsage,
        gpuModel: metrics.gpuModel,
        dpuStatus: metrics.dpuStatus,
        loadAvg: metrics.loadAvg,
        uptime: metrics.uptime,
        diskUsage: metrics.diskUsage,
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    // ─── GET /v1/machines/:id/audit — Machine audit log ────────────
    const auditMatch = url.match(/^\/v1\/machines\/([^/]+)\/audit$/);
    if (method === 'GET' && auditMatch) {
      const id = auditMatch[1];

      // Verify machine exists
      const machine = await db
        .select({ id: machines.id })
        .from(machines)
        .where(eq(machines.id, id))
        .get();

      if (!machine) {
        json(res, 404, { error: 'Machine not found', id });
        return true;
      }

      const parsed = new URL(url, 'http://localhost');
      const limit = parseInt(parsed.searchParams.get('limit') || '20', 10);
      const offset = parseInt(parsed.searchParams.get('offset') || '0', 10);

      const logs = await db
        .select()
        .from(killSwitchAuditLog)
        .where(eq(killSwitchAuditLog.machineId, id))
        .orderBy(desc(killSwitchAuditLog.timestamp))
        .limit(limit)
        .offset(offset)
        .all();

      const data = logs.map((row: any) => ({
        id: row.id,
        timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : '',
        userId: row.userId,
        reason: row.reason,
        previousState: row.previousState,
        newState: row.newState,
        traceId: row.traceId,
        machineId: row.machineId,
        severity: row.severity,
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
      }));

      json(res, 200, { data, limit, offset, machineId: id });
      return true;
    }

    // ─── GET /v1/machines/:id — Get machine by ID ──────────────────
    const idMatch = url.match(/^\/v1\/machines\/([^/]+)$/);
    if (method === 'GET' && idMatch) {
      const id = idMatch[1];

      const machine = await db
        .select()
        .from(machines)
        .where(eq(machines.id, id))
        .get();

      if (!machine) {
        json(res, 404, { error: 'Machine not found', id });
        return true;
      }

      json(res, 200, serializeMachine(machine));
      return true;
    }

    // ─── PATCH /v1/machines/:id — Update machine ────────────────────
    if (method === 'PATCH' && idMatch) {
      const id = idMatch[1];
      const body = await parseJsonBody(req);

      if (!body || Object.keys(body).length === 0) {
        json(res, 400, { error: 'Request body required' });
        return true;
      }

      const existing = await db
        .select()
        .from(machines)
        .where(eq(machines.id, id))
        .get();

      if (!existing) {
        json(res, 404, { error: 'Machine not found', id });
        return true;
      }

      const updates: Record<string, unknown> = {};

      if (body.name !== undefined) {
        const err = validateName(body.name);
        if (err) { json(res, 400, { error: err }); return true; }
        updates.name = body.name;
      }
      if (body.hostname !== undefined) {
        const err = validateHostname(body.hostname);
        if (err) { json(res, 400, { error: err }); return true; }
        // Check uniqueness
        const dup = await db
          .select({ id: machines.id })
          .from(machines)
          .where(and(eq(machines.hostname, body.hostname), ne(machines.id, id)))
          .get();
        if (dup) {
          json(res, 409, { error: 'Hostname already in use', hostname: body.hostname });
          return true;
        }
        updates.hostname = body.hostname;
      }
      if (body.status !== undefined) {
        if (!['active', 'inactive', 'offline'].includes(body.status)) {
          json(res, 400, { error: 'status must be active, inactive, or offline' });
          return true;
        }
        updates.status = body.status;
      }
      if (body.role !== undefined) {
        const err = validateRole(body.role);
        if (err) { json(res, 400, { error: err }); return true; }
        updates.role = body.role;
      }
      if (body.hasDpu !== undefined) {
        updates.hasDpu = Boolean(body.hasDpu);
      }
      if (body.specs !== undefined) {
        updates.specs = JSON.stringify(body.specs);
      }
      // ADR-138: onboarding completion — clearing monitoring_only enables
      // active responses; zone assignment places the machine tenant.
      if (body.monitoringOnly !== undefined) {
        updates.monitoringOnly = Boolean(body.monitoringOnly);
      }
      if (body.zone !== undefined) {
        if (typeof body.zone !== 'string' || body.zone.length < 1 || body.zone.length > 64) {
          json(res, 400, { error: 'zone must be 1-64 characters' });
          return true;
        }
        updates.zone = body.zone;
      }

      await db.update(machines)
        .set(updates as any)
        .where(eq(machines.id, id));

      const updated = await db
        .select()
        .from(machines)
        .where(eq(machines.id, id))
        .get();

      // Publish to Redis
      if (publishEvent) {
        await publishEvent('bcp:machines:events', JSON.stringify({
          type: 'machine-updated',
          payload: serializeMachine(updated),
        }));
      }

      json(res, 200, serializeMachine(updated));
      return true;
    }

    // ─── DELETE /v1/machines/:id — Remove machine ───────────────────
    if (method === 'DELETE' && idMatch) {
      const id = idMatch[1];

      const existing = await db
        .select()
        .from(machines)
        .where(eq(machines.id, id))
        .get();

      if (!existing) {
        json(res, 404, { error: 'Machine not found', id });
        return true;
      }

      const machineData = serializeMachine(existing);
      await db.delete(machines).where(eq(machines.id, id));

      // Publish to Redis
      if (publishEvent) {
        await publishEvent('bcp:machines:events', JSON.stringify({
          type: 'machine-removed',
          payload: { id, name: machineData.name, timestamp: new Date().toISOString() },
        }));
      }

      json(res, 200, { success: true, deleted: id });
      return true;
    }

    return false;
  } catch (err: any) {
    console.error('[machines] Error:', err.message);
    json(res, 500, { error: 'Internal server error', detail: err.message });
    return true;
  }
}

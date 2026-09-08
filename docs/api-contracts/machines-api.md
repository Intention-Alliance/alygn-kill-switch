# Machines API Schema — Kill Switch Dashboard

**Version:** 1.0.0  
**Date:** 2026-05-13  

---

## 1. Overview

The Machines API replaces the hardcoded `INITIAL_MACHINES` array in `apps/web-regulator/app/(dashboard)/machines/page.tsx` with a live, SQLite-backed machine inventory. Machines register themselves via heartbeat endpoints, and the dashboard displays them in real-time.

**Base path:** `/v1/machines`  
**Auth:** Better-Auth session (Bearer token via cookie or WS token param)  

---

## 2. Endpoints

### 2.1 `GET /v1/machines` — List All Machines

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | — | Filter: `active`, `inactive`, `offline` |
| `sortBy` | string | `lastSeen` | Sort field: `name`, `status`, `lastSeen`, `createdAt` |
| `order` | string | `desc` | Sort order: `asc`, `desc` |
| `limit` | number | `50` | Max results |
| `offset` | number | `0` | Pagination offset |

**Response 200:**

```json
{
  "data": [
    {
      "id": "machine-andlersrv-001",
      "name": "andlersrv",
      "hostname": "andlersrv.tail62d797.ts.net",
      "status": "active",
      "role": "Primary Controller",
      "hasDpu": false,
      "specs": {
        "cpu": "AMD Ryzen 9",
        "ram": "64GB",
        "gpu": "NVIDIA RTX 4090",
        "dpu": null
      },
      "lastSeen": "2026-05-13T02:00:00.000Z",
      "createdAt": "2026-04-15T00:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

**Drizzle query:**

```typescript
// apps/server-kill-switch/src/routes/machines.ts
let query = db.select().from(machines);
if (status) { query = query.where(eq(machines.status, status)); }
query = query.orderBy(desc(machines[mappedSortBy])).limit(limit).offset(offset);
const results = await query.all();
```

### 2.2 `POST /v1/machines/register` — Register New Machine

**Request Body:**

```json
{
  "name": "worker-node-01",
  "hostname": "worker01.tail62d797.ts.net",
  "role": "Worker Node",
  "hasDpu": false,
  "specs": {
    "cpu": "Intel i9-13900K",
    "ram": "32GB",
    "gpu": "NVIDIA RTX 4070",
    "dpu": null
  }
}
```

**Validation:**
- `name` required, 1-64 chars, alphanumeric + hyphens
- `hostname` required, unique, valid hostname format
- `role` required, 1-32 chars
- `hasDpu` optional, boolean (default false)
- `specs` optional, valid JSON object

**Response 201:**

```json
{
  "id": "machine-worker-abc123",
  "name": "worker-node-01",
  "hostname": "worker01.tail62d797.ts.net",
  "status": "active",
  "role": "Worker Node",
  "hasDpu": false,
  "specs": { "cpu": "Intel i9-13900K", "ram": "32GB", "gpu": "NVIDIA RTX 4070", "dpu": null },
  "lastSeen": "2026-05-13T02:05:00.000Z",
  "createdAt": "2026-05-13T02:05:00.000Z"
}
```

**Response 409:** Hostname already registered:
```json
{ "error": "Hostname already registered", "hostname": "worker01.tail62d797.ts.net" }
```

### 2.3 `GET /v1/machines/:id` — Get Machine by ID

**Response 200:** Same shape as single item in list response.

**Response 404:**
```json
{ "error": "Machine not found", "id": "machine-unknown" }
```

### 2.4 `PATCH /v1/machines/:id` — Update Machine

**Request Body** (all fields optional):

```json
{
  "name": "renamed-node",
  "status": "inactive",
  "role": "Backup Controller",
  "hasDpu": true,
  "specs": { "cpu": "AMD Ryzen 9", "ram": "128GB", "gpu": "NVIDIA RTX 4090", "dpu": "BlueField-3" }
}
```

**Validation:** Same as register, but all fields optional. At least one field must be present.

**Response 200:** Updated machine object.

**Response 404:** Machine not found.

**Drizzle query:**

```typescript
const updates: Record<string, unknown> = {};
if (body.name !== undefined) updates.name = body.name;
if (body.status !== undefined) updates.status = body.status;
if (body.role !== undefined) updates.role = body.role;
if (body.hasDpu !== undefined) updates.hasDpu = Boolean(body.hasDpu);
if (body.specs !== undefined) updates.specs = JSON.stringify(body.specs);

await db.update(machines).set(updates as any).where(eq(machines.id, id)).run();
```

### 2.5 `DELETE /v1/machines/:id` — Remove Machine

**Response 200:**
```json
{ "success": true, "deleted": "machine-andlersrv-001" }
```

**Response 404:** Machine not found.

**Cascade behavior:** Deleting a machine also deletes its associated `machine_flags` and `agents` rows (via `ON DELETE CASCADE` foreign keys).

### 2.6 `POST /v1/machines/:id/heartbeat` — Machine Heartbeat

**Request Body** (all optional):

```json
{
  "cpuUsage": 12.4,
  "memoryUsage": 34.7,
  "agentVersion": "1.2.0"
}
```

**Response 200:**

```json
{
  "acknowledged": true,
  "machineId": "machine-andlersrv-001",
  "timestamp": "2026-05-13T02:10:00.000Z"
}
```

**Side effects:**
1. Updates `machines.lastSeen` to current timestamp
2. Updates `machines.status` to `active` (if previously `inactive` or `offline`)
3. Optionally stores CPU/memory in `kill_switch_audit_log.metadata` as a periodic metric

**Drizzle query:**

```typescript
await db.update(machines)
  .set({ lastSeen: new Date(), status: 'active' })
  .where(eq(machines.id, id))
  .run();
```

### 2.7 `GET /v1/machines/:id/status` — Machine Status + DPU Info

**Response 200:**

```json
{
  "machine": {
    "id": "machine-andlersrv-001",
    "name": "andlersrv",
    "status": "active",
    "lastSeen": "2026-05-13T02:10:00.000Z"
  },
  "dpu": {
    "present": false,
    "model": null,
    "status": "not_available",
    "capabilities": []
  },
  "agents": [
    {
      "id": "agent-abc123",
      "name": "alygn-scoring-agent",
      "version": "1.2.0",
      "lastHeartbeat": "2026-05-13T02:09:00.000Z"
    }
  ],
  "activeFlags": [
    {
      "key": "llm_interception_enabled",
      "value": "true",
      "source": "global"
    }
  ]
}
```

**DPU logic:** Check `machine.hasDpu`. If true, parse `specs.dpu` for model info. Future: query hardware-level DPU status.

**Active flags logic:** Merge global `feature_flags` with `machine_flags` for this machine. Machine overrides take precedence (`source: "machine"` vs `source: "global"`).

---

## 3. Route Implementation

### File: `apps/server-kill-switch/src/routes/machines.ts`

```typescript
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
 */

import { eq, desc, asc } from 'drizzle-orm';
import { db } from '../db/index';
import { machines, machineFlags, agents, featureFlags } from '../db/schema';

export async function handleMachinesRoutes(
  method: string,
  url: string,
  req: any,
  res: any,
): Promise<boolean> {
  if (!url.startsWith('/v1/machines')) return false;
  // ... implementation follows route match pattern from flags.ts
}
```

**Integration in `index.ts`:** Add `await handleMachinesRoutes(method, url, req, res)` to the route dispatch chain.

---

## 4. Frontend Integration

### File: `apps/web-regulator/app/(dashboard)/machines/page.tsx`

Replace:
```typescript
const [machines, setMachines] = useState<Machine[]>(INITIAL_MACHINES);
```

With:
```typescript
const fetchMachines = useCallback(async () => {
  const data = await apiGet<{ data: Machine[] }>("/api/machines");
  setMachines(data.data);
}, []);
```

Then use the WebSocket hook for real-time updates (`machine-update` and `machine-heartbeat` message types).

---

## 5. Rate Limits

| Endpoint Group | Rate Limit | Window |
|---------------|------------|--------|
| `GET /v1/machines*` | 60/min | 60s (read) |
| `POST/PATCH/DELETE /v1/machines*` | 10/min | 60s (write) |
| Heartbeat | Bypasses rate limit entirely | Internal machine comm |

**Implementation:** Add a route prefix check in `middleware/rate-limit.ts`:

```typescript
// Read endpoints get 60/min
if (method === 'GET' && url.startsWith('/v1/machines')) {
  return readLimiter.check(ip);
}
// Write endpoints get 10/min
if (['POST','PATCH','DELETE'].includes(method) && url.startsWith('/v1/machines')) {
  return writeLimiter.check(ip);
}
// Heartbeat bypasses rate limiting
if (url.includes('/heartbeat')) {
  return { allowed: true };
}
```

---

## 6. WebSocket Events

These machine-related events are broadcast via WebSocket:

| Event Type | Trigger |
|------------|---------|
| `machine-registered` | New machine via `POST /register` |
| `machine-updated` | Machine modified via `PATCH` |
| `machine-removed` | Machine deleted via `DELETE` |
| `machine-heartbeat` | Heartbeat received via `POST /:id/heartbeat` |

**Message format:**

```json
{
  "type": "machine-registered",
  "payload": { /* full machine object */ }
}
```

These use the same WebSocket infrastructure from `websocket-manager.ts` — publish to Redis channel `bcp:machines:events` and the WebSocket manager broadcasts to all connected admin clients.

---

## 7. TypeScript Types

Add to `packages/shared-types/src/kill-switch.ts`:

```typescript
export interface Machine {
  id: string;
  name: string;
  hostname: string;
  status: "active" | "inactive" | "offline";
  role: string;
  hasDpu: boolean;
  specs: MachineSpecs | null;
  lastSeen: string | null;
  createdAt: string;
}

export interface MachineSpecs {
  cpu: string;
  ram: string;
  gpu: string;
  dpu: string | null;
}

export interface MachineStatus {
  machine: Pick<Machine, "id" | "name" | "status" | "lastSeen">;
  dpu: DpuInfo;
  agents: AgentInfo[];
  activeFlags: ActiveFlagInfo[];
}

export interface DpuInfo {
  present: boolean;
  model: string | null;
  status: "active" | "not_available" | "error";
  capabilities: string[];
}

export interface AgentInfo {
  id: string;
  name: string;
  version: string;
  lastHeartbeat: string | null;
}

export interface ActiveFlagInfo {
  key: string;
  value: string;
  source: "global" | "machine";
}
```

Update `packages/shared-types/src/index.ts` to re-export these new types via existing `kill-switch` re-export.

Also update `apps/web-regulator/types/shared.ts` to mirror the new `Machine` type.

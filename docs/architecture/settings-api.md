# Settings Persistence API — Kill Switch Dashboard

**Version:** 1.0.0  
**Date:** 2026-05-13  

---

## 1. Overview

The Settings API replaces the dead local-state UI in `apps/web-regulator/app/(dashboard)/settings/page.tsx` with a fully persistent, SQLite-backed settings system. All settings are stored as key-value pairs and survive server restarts.

**Base path:** `/v1/settings`  
**Auth:** Better-Auth session (admin role required for writes)  
**Storage:** SQLite `setting` table (schema defined in `schema-additions.md`)  

---

## 2. Endpoints

### 2.1 `GET /v1/settings` — Get All Settings

**Response 200:**

```json
{
  "settings": {
    "auto_poll_interval": "5000",
    "enable_notifications": "true",
    "audit_log_retention_days": "30",
    "session_timeout_minutes": "60",
    "ip_allowlist_enabled": "false",
    "rate_limit_per_minute": "100"
  },
  "updatedAt": "2026-05-13T02:00:00.000Z"
}
```

The `updatedAt` field reflects the most recent `updatedAt` timestamp from any setting.

**Drizzle query:**

```typescript
// apps/server-kill-switch/src/routes/settings.ts
const rows = await db.select().from(settings).all();
const settingsMap: Record<string, string> = {};
let latestUpdate = 0;
for (const row of rows) {
  settingsMap[row.key] = row.value;
  if (row.updatedAt.getTime() > latestUpdate) {
    latestUpdate = row.updatedAt.getTime();
  }
}
json(res, 200, {
  settings: settingsMap,
  updatedAt: latestUpdate > 0 ? new Date(latestUpdate).toISOString() : null,
});
```

### 2.2 `POST /v1/settings` — Update Multiple Settings

**Request Body:**

```json
{
  "settings": {
    "auto_poll_interval": "3000",
    "enable_notifications": "false",
    "rate_limit_per_minute": "200"
  }
}
```

**Validation:**
- `settings` required, must be an object with at least 1 key
- Each key must be one of the known setting keys (see §3 Default Settings)
- Each value must pass type-specific validation (see §3)
- Rejects unknown keys with 400

**Response 200:**

```json
{
  "updated": ["auto_poll_interval", "enable_notifications", "rate_limit_per_minute"],
  "timestamp": "2026-05-13T02:00:00.000Z"
}
```

**Drizzle query (batch upsert):**

```typescript
const now = new Date();
for (const [key, value] of Object.entries(body.settings)) {
  // Upsert: insert or update
  await db.insert(settings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } })
    .run();
}
```

### 2.3 `GET /v1/settings/:key` — Get Single Setting

**Response 200:**

```json
{
  "key": "auto_poll_interval",
  "value": "5000",
  "updatedAt": "2026-05-13T02:00:00.000Z"
}
```

**Response 404:**
```json
{ "error": "Setting not found", "key": "unknown_key" }
```

### 2.4 `PUT /v1/settings/:key` — Update Single Setting

**Request Body:**

```json
{
  "value": "10000"
}
```

**Validation:** Type-specific (see §3).

**Response 200:**

```json
{
  "key": "auto_poll_interval",
  "value": "10000",
  "updatedAt": "2026-05-13T02:00:00.000Z"
}
```

**Response 404:** Setting key unknown.

---

## 3. Default Settings & Validation

### 3.1 Pre-Seeded Settings

| Key | Default Value | Type | Validation | Description |
|-----|---------------|------|------------|-------------|
| `auto_poll_interval` | `"5000"` | number (ms) | 1000–60000, integer | Status polling interval for WebSocket fallback |
| `enable_notifications` | `"true"` | boolean | `"true"` or `"false"` | Desktop notification toggles |
| `audit_log_retention_days` | `"30"` | number (days) | 1–365, integer | Days to retain audit entries before cleanup |
| `session_timeout_minutes` | `"60"` | number (min) | 5–480, integer | Auto-logout after inactivity |
| `ip_allowlist_enabled` | `"false"` | boolean | `"true"` or `"false"` | Toggle IP allowlist enforcement |
| `rate_limit_per_minute` | `"100"` | number (req/min) | 10–1000, integer | General rate limit ceiling |

### 3.2 Validation Function

```typescript
// apps/server-kill-switch/src/routes/settings.ts

const SETTING_VALIDATORS: Record<string, (value: string) => string | null> = {
  auto_poll_interval: (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 1000 || n > 60000) return 'Must be integer 1000-60000';
    return null;
  },
  enable_notifications: (v) => {
    if (v !== 'true' && v !== 'false') return 'Must be "true" or "false"';
    return null;
  },
  audit_log_retention_days: (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 1 || n > 365) return 'Must be integer 1-365';
    return null;
  },
  session_timeout_minutes: (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 5 || n > 480) return 'Must be integer 5-480';
    return null;
  },
  ip_allowlist_enabled: (v) => {
    if (v !== 'true' && v !== 'false') return 'Must be "true" or "false"';
    return null;
  },
  rate_limit_per_minute: (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 10 || n > 1000) return 'Must be integer 10-1000';
    return null;
  },
};

function validateSetting(key: string, value: string): string | null {
  const validator = SETTING_VALIDATORS[key];
  if (!validator) return `Unknown setting: ${key}`;
  return validator(value);
}
```

### 3.3 Seeding on Startup

Settings are seeded via `apps/server-kill-switch/src/db/seed.ts` (defined in `schema-additions.md` §4.2). The seeding function runs on every startup and uses `INSERT OR IGNORE` semantics — it won't overwrite user-changed values.

---

## 4. Route Implementation

### File: `apps/server-kill-switch/src/routes/settings.ts`

```typescript
/**
 * Settings API — Key-Value Persistence
 *
 * Endpoints:
 *   GET  /v1/settings         — Get all settings
 *   POST /v1/settings         — Update multiple settings
 *   GET  /v1/settings/:key    — Get single setting
 *   PUT  /v1/settings/:key    — Update single setting
 *
 * All values stored as text in SQLite.
 * Type coercion handled by validators.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { settings } from '../db/schema';

export async function handleSettingsRoutes(
  method: string,
  url: string,
  req: any,
  res: any,
): Promise<boolean> {
  if (!url.startsWith('/v1/settings')) return false;

  // ... implementation follows existing route patterns (flags.ts style)
  // with json() helper, parseJsonBody(), and match-based routing
}
```

**Integration in `index.ts`:** Add to the route dispatch chain, after auth check but before 404:

```typescript
const handled =
  await handleAuthRoutes(method, url, req, res, service, authRateLimiter) ||
  await handleKillSwitchRoutes(method, url, req, res, service, ip) ||
  await handleFlagsRoutes(method, url, req, res, authenticatedUserId || 'api') ||
  await handleMachinesRoutes(method, url, req, res) ||
  await handleSettingsRoutes(method, url, req, res);
```

### 4.1 Role-Based Access Control

Settings **reads** are available to any authenticated user.  
Settings **writes** (`POST`, `PUT`) require `admin` role.

**Implementation:** Check `req.user.role === 'admin'` in write handlers. Return 403 if not admin.

```typescript
// In settings route handler for POST/PUT:
if (authenticatedUserRole !== 'admin') {
  json(res, 403, { error: 'Admin role required to modify settings' });
  return true;
}
```

---

## 5. Frontend Integration

### File: `apps/web-regulator/app/(dashboard)/settings/page.tsx`

**Current state:** All settings are local React state. Switches and inputs have `defaultChecked`/`defaultValue` but no persistence.

**Required changes:**

1. Add `useEffect` to fetch settings on mount:

```typescript
const [settings, setSettings] = useState<Record<string, string>>({});
const [isLoading, setIsLoading] = useState(true);

useEffect(() => {
  apiGet<{ settings: Record<string, string> }>("/api/settings")
    .then(data => setSettings(data.settings))
    .catch(err => toast.error(err.message))
    .finally(() => setIsLoading(false));
}, []);
```

2. Replace `defaultChecked`/`defaultValue` with controlled `checked`/`value`:

```tsx
<Switch
  checked={settings.enable_notifications === 'true'}
  onCheckedChange={(checked) => {
    const newVal = checked ? 'true' : 'false';
    setSettings(prev => ({ ...prev, enable_notifications: newVal }));
    apiPut('/v1/settings/enable_notifications', { value: newVal });
  }}
/>
```

3. Replace the "Save Settings" button handler with individual auto-save (each toggle/input saves immediately) or batch save via `POST /v1/settings`:

```typescript
async function handleSave() {
  try {
    await apiPost('/v1/settings', { settings });
    toast.success('Settings saved');
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to save settings');
  }
}
```

### 5.1 Real-Time Updates

Settings are **not** broadcast via WebSocket by default (they change rarely and don't affect safety). However, the `auto_poll_interval` change should trigger a client-side reconfiguration:

```typescript
// When auto_poll_interval changes:
wsManager.updatePollInterval(parseInt(settings.auto_poll_interval, 10));
```

---

## 6. Rate Limits

| Endpoint | Rate Limit | Window |
|----------|------------|--------|
| `GET /v1/settings*` | 60/min (read) | 60s |
| `POST /v1/settings`, `PUT /v1/settings/:key` | 10/min (write) | 60s |

Implemented via the split rate limiter pattern from §4.4 of this document.

---

## 7. TypeScript Types

Add to `packages/shared-types/src/kill-switch.ts`:

```typescript
export interface AppSettings {
  auto_poll_interval: number;
  enable_notifications: boolean;
  audit_log_retention_days: number;
  session_timeout_minutes: number;
  ip_allowlist_enabled: boolean;
  rate_limit_per_minute: number;
}

// Raw settings from API (all strings)
export interface RawSettings {
  [key: string]: string;
}

// Helper to parse raw settings to typed values
export function parseSettings(raw: RawSettings): AppSettings {
  return {
    auto_poll_interval: parseInt(raw.auto_poll_interval ?? '5000', 10),
    enable_notifications: raw.enable_notifications === 'true',
    audit_log_retention_days: parseInt(raw.audit_log_retention_days ?? '30', 10),
    session_timeout_minutes: parseInt(raw.session_timeout_minutes ?? '60', 10),
    ip_allowlist_enabled: raw.ip_allowlist_enabled === 'true',
    rate_limit_per_minute: parseInt(raw.rate_limit_per_minute ?? '100', 10),
  };
}
```

Update `apps/web-regulator/types/shared.ts` to mirror these types.

/**
 * API Keys Routes — Unit Tests (Card 0e2f9fec)
 *
 * Mocks the Drizzle `db` module to test the admin + internal endpoints
 * in isolation. Covers:
 *   - list / create / rotate / revoke / audit
 *   - internal lookup (with valid + missing + wrong internal key)
 *   - scope check on create
 *   - idempotency on revoke
 *
 * @author Keridz ⚙️ (be-coder)
 */

import { describe, it, expect, mock, beforeEach, beforeAll } from 'bun:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Mock drizzle-orm's eq() so we can introspect the value easily.
// (Mirrors the pattern in settings.test.ts — see the source comment.)
// We have to provide all the named exports the route file uses, even if
// they're just no-ops for the test.
mock.module('drizzle-orm', () => ({
  eq: (left: any, right: any) => ({ __eq: right }),
  desc: (col: any) => ({ __desc: col }),
  and: (...args: any[]) => ({ __and: args }),
  isNull: (col: any) => ({ __isNull: col }),
  lt: (left: any, right: any) => ({ __lt: { left, right } }),
  sql: (strings: TemplateStringsArray, ...values: any[]) => ({ __sql: 'sql-marker' }),
}))

// ─── In-memory mock state (module-level for shared across imports) ────

interface MockKey {
  id: string
  keyPrefix: string
  apiKeyHash: string
  name: string
  scopes: string
  createdAt: Date
  createdBy: string
  lastUsedAt: Date | null
  lastUsedIp: string | null
  revokedAt: Date | null
  revokedBy: string | null
  expiresAt: Date | null
  notes: string | null
}

interface MockAudit {
  id: number
  keyId: string | null
  action: string
  actor: string
  at: Date
  meta: string | null
  webhookPath: string | null
}

const state = {
  keys: [] as MockKey[],
  audits: [] as MockAudit[],
  nextAuditId: 1,
}

function reset() {
  state.keys.length = 0
  state.audits.length = 0
  state.nextAuditId = 1
}

// ─── Mock the db module ─────────────────────────────────────────

const dbPath = path.resolve(__dirname, '../../db/index.ts')
mock.module(dbPath, () => {
  // Helper: extract the value the query is filtering on
  function getEqValue(cond: any): string | null {
    if (!cond) return null
    if (typeof cond === 'object' && '__eq' in cond) return cond.__eq
    return null
  }

  // Table identity — use Drizzle's Symbol(drizzle:Name)
  function tableName(table: any): string | null {
    if (!table) return null
    if (table._name) return table._name
    const sym = Object.getOwnPropertySymbols(table).find((s) => s.toString() === 'Symbol(drizzle:Name)')
    if (sym) {
      const v = (table as any)[sym]
      if (typeof v === 'string') return v
    }
    return null
  }

  const makeQuery = () => {
    let _table: any = null
    let _cond: any = null
    let _order: any = null
    let _limit: number | null = null

    const chain: any = {
      from(table: any) {
        _table = table
        return chain
      },
      where(cond: any) {
        _cond = cond
        return chain
      },
      orderBy(o: any) {
        _order = o
        return chain
      },
      limit(n: number) {
        _limit = n
        return chain
      },
      then(resolve: any) {
        const t = tableName(_table)
        const eqVal = getEqValue(_cond)
        let result: any[] = []
        if (t === 'webhook_api_keys') {
          // The route uses eq(apiKeyHash, hash) AND eq(keyPrefix, prefix)
          // We need to know which column. Drizzle eq(col, val) is hard to
          // introspect from the column ref alone; use the value's shape:
          // hash is 64 hex chars, prefix is 'wk_' + 5 base62.
          if (eqVal !== null) {
            if (eqVal.length === 64 && /^[0-9a-f]+$/.test(eqVal)) {
              result = state.keys.filter((k) => k.apiKeyHash === eqVal)
            } else if (eqVal.startsWith('wk_')) {
              result = state.keys.filter((k) => k.keyPrefix === eqVal)
            } else {
              result = state.keys.filter((k) => k.id === eqVal)
            }
          } else {
            result = [...state.keys]
          }
        } else if (t === 'webhook_api_key_audit') {
          result = eqVal !== null ? state.audits.filter((a) => a.keyId === eqVal) : [...state.audits]
        }
        if (_order === 'desc') result = result.reverse()
        if (_limit !== null) result = result.slice(0, _limit)
        return resolve(result)
      },
    }
    return chain
  }

  return {
    db: {
      select: () => makeQuery(),
      query: {
        webhookApiKeys: {
          findFirst: (opts: any) => {
            const eqVal = opts?.where?.__eq
            const found = eqVal !== undefined ? state.keys.find((k) => k.id === eqVal) : null
            return Promise.resolve(found || null)
          },
        },
      },
      insert: (table: any) => ({
        values: (row: any) => {
          const t = tableName(table)
          if (t === 'webhook_api_keys') {
            if (state.keys.some((k) => k.apiKeyHash === row.apiKeyHash)) {
              throw new Error('UNIQUE constraint failed: webhook_api_keys.api_key_hash')
            }
            state.keys.push({ ...row, id: row.id || `wk_test_${state.nextAuditId++}` })
          } else if (t === 'webhook_api_key_audit') {
            state.audits.push({ id: state.nextAuditId++, ...row, webhookPath: row.webhookPath ?? null })
          }
          return Promise.resolve({ success: true })
        },
      }),
      update: (table: any) => ({
        set: (patch: any) => ({
          where: (cond: any) => {
            const id = getEqValue(cond)
            const k = state.keys.find((k) => k.id === id)
            if (k) Object.assign(k, patch)
            return Promise.resolve({ success: true })
          },
        }),
      }),
      delete: (table: any) => ({
        where: (cond: any) => {
          const id = getEqValue(cond)
          if (id) {
            const i = state.keys.findIndex((k) => k.id === id)
            if (i >= 0) state.keys.splice(i, 1)
          }
          return Promise.resolve({ success: true })
        },
      }),
      transaction: async (fn: any) => {
        return fn({
          query: {
            webhookApiKeys: {
              findFirst: async ({ where: cond }: any) => {
                const eqVal = getEqValue(cond)
                return state.keys.find((k) => k.id === eqVal) || undefined
              },
            },
          },
          update: (table: any) => ({
            set: (patch: any) => ({
              where: (cond: any) => {
                const id = getEqValue(cond)
                const k = state.keys.find((k) => k.id === id)
                if (k) Object.assign(k, patch)
                return Promise.resolve({ success: true })
              },
            }),
          }),
          insert: (table: any) => ({
            values: (row: any) => {
              const t = tableName(table)
              if (t === 'webhook_api_keys') {
                if (state.keys.some((k) => k.apiKeyHash === row.apiKeyHash)) {
                  throw new Error('UNIQUE constraint failed')
                }
                state.keys.push({ ...row, id: row.id || `wk_test_${state.nextAuditId++}` })
              } else if (t === 'webhook_api_key_audit') {
                state.audits.push({ id: state.nextAuditId++, ...row, webhookPath: row.webhookPath ?? null })
              }
              return Promise.resolve({ success: true })
            },
          }),
        })
      },
    },
  }
})

// ─── Set up env BEFORE importing the route handler ───────────────

process.env.ADMIN_UI_API_KEY = 'test-admin-key-32-chars-min-len-1234'
process.env.KILL_SWITCH_INTERNAL_KEY = 'test-internal-key-32-chars-min-len-12'

// Import after mocks are set up
const { handleApiKeysRoutes } = await import('../api-keys')

// ─── Helpers ─────────────────────────────────────────────────────

function makeReq(url: string, method: string, body?: any, authHeader?: string) {
  const headers: Record<string, string> = {}
  if (authHeader) headers.authorization = authHeader
  if (body) headers['content-type'] = 'application/json'
  return {
    method,
    url,
    headers,
    body: body ? JSON.stringify(body) : '',
    ip: '127.0.0.1',
  }
}

function makeRes() {
  const res: any = {
    _h: {} as Record<string, string>,
    _s: 200,
    _b: '',
    setHeader(n: string, v: string) {
      this._h[n.toLowerCase()] = String(v)
    },
    writeHead(s: number, h?: Record<string, string>) {
      this._s = s
      if (h) Object.entries(h).forEach(([k, v]) => (this._h[k.toLowerCase()] = String(v)))
    },
    end(d?: string) {
      this._b = d || ''
    },
  }
  return res
}

const ADMIN_AUTH = `Bearer test-admin-key-32-chars-min-len-1234`
const INTERNAL_KEY = 'test-internal-key-32-chars-min-len-12'

// ─── Tests ───────────────────────────────────────────────────────

describe('handleApiKeysRoutes — admin', () => {
  beforeEach(() => {
    reset()
  })

  it('listKeys: returns empty array when no keys', async () => {
    const req = makeReq('/v1/admin/api-keys', 'GET', undefined, ADMIN_AUTH)
    const res = makeRes()
    const handled = await handleApiKeysRoutes('GET', '/v1/admin/api-keys', req, res, '127.0.0.1')
    expect(handled).toBe(true)
    expect(res._s).toBe(200)
    const body = JSON.parse(res._b)
    expect(body.keys).toEqual([])
  })

  it('listKeys: requires Bearer admin key', async () => {
    const req = makeReq('/v1/admin/api-keys', 'GET')
    const res = makeRes()
    const handled = await handleApiKeysRoutes('GET', '/v1/admin/api-keys', req, res, '127.0.0.1')
    expect(handled).toBe(true)
    expect(res._s).toBe(401)
  })

  it('createKey: returns 201 with plaintext key', async () => {
    const req = makeReq('/v1/admin/api-keys', 'POST', { name: 'test', scopes: 'live-chat' }, ADMIN_AUTH)
    const res = makeRes()
    const handled = await handleApiKeysRoutes('POST', '/v1/admin/api-keys', req, res, '127.0.0.1')
    expect(handled).toBe(true)
    expect(res._s).toBe(201)
    const body = JSON.parse(res._b)
    expect(body.key).toBeTruthy()
    expect(body.key.startsWith('wk_')).toBe(true)
    expect(body.keyPrefix).toBe(body.key.slice(0, 8))
    expect(body.name).toBe('test')
    expect(body.scopes).toEqual(['live-chat'])
  })

  it('createKey: rejects unknown scope', async () => {
    const req = makeReq('/v1/admin/api-keys', 'POST', { name: 'test', scopes: 'invalid-scope' }, ADMIN_AUTH)
    const res = makeRes()
    const handled = await handleApiKeysRoutes('POST', '/v1/admin/api-keys', req, res, '127.0.0.1')
    expect(handled).toBe(true)
    expect(res._s).toBe(400)
    const body = JSON.parse(res._b)
    expect(body.error).toMatch(/unknown scope/)
  })

  it('createKey: rejects empty name', async () => {
    const req = makeReq('/v1/admin/api-keys', 'POST', { name: '', scopes: 'live-chat' }, ADMIN_AUTH)
    const res = makeRes()
    const handled = await handleApiKeysRoutes('POST', '/v1/admin/api-keys', req, res, '127.0.0.1')
    expect(handled).toBe(true)
    expect(res._s).toBe(400)
  })

  it('createKey: accepts scope array', async () => {
    const req = makeReq(
      '/v1/admin/api-keys',
      'POST',
      { name: 'multi', scopes: ['live-chat', 'blog-pipeline'] },
      ADMIN_AUTH,
    )
    const res = makeRes()
    const handled = await handleApiKeysRoutes('POST', '/v1/admin/api-keys', req, res, '127.0.0.1')
    expect(handled).toBe(true)
    expect(res._s).toBe(201)
    const body = JSON.parse(res._b)
    expect(body.scopes).toEqual(['live-chat', 'blog-pipeline'])
  })

  it('revokeKey: soft-deletes by setting revokedAt', async () => {
    // First create
    const createReq = makeReq(
      '/v1/admin/api-keys',
      'POST',
      { name: 'to-revoke', scopes: 'live-chat' },
      ADMIN_AUTH,
    )
    const createRes = makeRes()
    await handleApiKeysRoutes('POST', '/v1/admin/api-keys', createReq, createRes, '127.0.0.1')
    const created = JSON.parse(createRes._b)
    const id = created.id

    // Then revoke
    const revokeReq = makeReq(`/v1/admin/api-keys/${id}`, 'DELETE', undefined, ADMIN_AUTH)
    const revokeRes = makeRes()
    const handled = await handleApiKeysRoutes('DELETE', `/v1/admin/api-keys/${id}`, revokeReq, revokeRes, '127.0.0.1')
    expect(handled).toBe(true)
    expect(revokeRes._s).toBe(204)
    const stored = state.keys.find((k) => k.id === id)
    expect(stored?.revokedAt).toBeInstanceOf(Date)
  })

  it('revokeKey: 404 on missing key', async () => {
    const req = makeReq('/v1/admin/api-keys/wk_does_not_exist', 'DELETE', undefined, ADMIN_AUTH)
    const res = makeRes()
    const handled = await handleApiKeysRoutes('DELETE', '/v1/admin/api-keys/wk_does_not_exist', req, res, '127.0.0.1')
    expect(handled).toBe(true)
    expect(res._s).toBe(404)
  })

  it('revokeKey: idempotent (204 even if already revoked)', async () => {
    // Create + revoke once
    const createReq = makeReq('/v1/admin/api-keys', 'POST', { name: 'idem', scopes: 'live-chat' }, ADMIN_AUTH)
    const createRes = makeRes()
    await handleApiKeysRoutes('POST', '/v1/admin/api-keys', createReq, createRes, '127.0.0.1')
    const id = JSON.parse(createRes._b).id
    await handleApiKeysRoutes('DELETE', `/v1/admin/api-keys/${id}`, makeReq(`/v1/admin/api-keys/${id}`, 'DELETE', undefined, ADMIN_AUTH), makeRes(), '127.0.0.1')
    // Revoke again
    const res = makeRes()
    const handled = await handleApiKeysRoutes('DELETE', `/v1/admin/api-keys/${id}`, makeReq(`/v1/admin/api-keys/${id}`, 'DELETE', undefined, ADMIN_AUTH), res, '127.0.0.1')
    expect(handled).toBe(true)
    expect(res._s).toBe(204)
  })

  it('rotateKey: creates new + revokes old', async () => {
    // Create
    const createReq = makeReq('/v1/admin/api-keys', 'POST', { name: 'rotate-me', scopes: 'live-chat,blog-pipeline' }, ADMIN_AUTH)
    const createRes = makeRes()
    await handleApiKeysRoutes('POST', '/v1/admin/api-keys', createReq, createRes, '127.0.0.1')
    const created = JSON.parse(createRes._b)
    const oldId = created.id

    // Rotate
    const rotateReq = makeReq(`/v1/admin/api-keys/${oldId}/rotate`, 'POST', undefined, ADMIN_AUTH)
    const rotateRes = makeRes()
    const handled = await handleApiKeysRoutes('POST', `/v1/admin/api-keys/${oldId}/rotate`, rotateReq, rotateRes, '127.0.0.1')
    expect(handled).toBe(true)
    expect(rotateRes._s).toBe(201)
    const body = JSON.parse(rotateRes._b)
    expect(body.id).not.toBe(oldId)
    expect(body.key).toBeTruthy()
    expect(body.revokedKeyId).toBe(oldId)
    expect(body.scopes).toEqual(['live-chat', 'blog-pipeline'])

    const oldKey = state.keys.find((k) => k.id === oldId)
    expect(oldKey?.revokedAt).toBeInstanceOf(Date)
  })

  it('rotateKey: 404 on missing key', async () => {
    const req = makeReq('/v1/admin/api-keys/wk_missing/rotate', 'POST', undefined, ADMIN_AUTH)
    const res = makeRes()
    const handled = await handleApiKeysRoutes('POST', '/v1/admin/api-keys/wk_missing/rotate', req, res, '127.0.0.1')
    expect(handled).toBe(true)
    expect(res._s).toBe(404)
  })

  it('rotateKey: 409 on already-revoked key', async () => {
    // Create + revoke
    const createReq = makeReq('/v1/admin/api-keys', 'POST', { name: 'already-dead', scopes: 'live-chat' }, ADMIN_AUTH)
    const createRes = makeRes()
    await handleApiKeysRoutes('POST', '/v1/admin/api-keys', createReq, createRes, '127.0.0.1')
    const id = JSON.parse(createRes._b).id
    await handleApiKeysRoutes('DELETE', `/v1/admin/api-keys/${id}`, makeReq(`/v1/admin/api-keys/${id}`, 'DELETE', undefined, ADMIN_AUTH), makeRes(), '127.0.0.1')

    // Try to rotate
    const res = makeRes()
    const handled = await handleApiKeysRoutes('POST', `/v1/admin/api-keys/${id}/rotate`, makeReq(`/v1/admin/api-keys/${id}/rotate`, 'POST', undefined, ADMIN_AUTH), res, '127.0.0.1')
    expect(handled).toBe(true)
    expect(res._s).toBe(409)
  })

  it('keyAudit: returns audit entries', async () => {
    // Create
    const createReq = makeReq('/v1/admin/api-keys', 'POST', { name: 'audited', scopes: 'live-chat' }, ADMIN_AUTH)
    const createRes = makeRes()
    await handleApiKeysRoutes('POST', '/v1/admin/api-keys', createReq, createRes, '127.0.0.1')
    const id = JSON.parse(createRes._b).id

    // Query audit
    const req = makeReq(`/v1/admin/api-keys/${id}/audit`, 'GET', undefined, ADMIN_AUTH)
    const res = makeRes()
    const handled = await handleApiKeysRoutes('GET', `/v1/admin/api-keys/${id}/audit`, req, res, '127.0.0.1')
    expect(handled).toBe(true)
    expect(res._s).toBe(200)
    const body = JSON.parse(res._b)
    expect(body.entries.length).toBeGreaterThan(0)
    expect(body.entries[0].action).toBe('create')
  })

  it('rejects non-admin path with false (not for us)', async () => {
    const req = makeReq('/v1/kill-switch/health', 'GET', undefined, ADMIN_AUTH)
    const res = makeRes()
    const handled = await handleApiKeysRoutes('GET', '/v1/kill-switch/health', req, res, '127.0.0.1')
    expect(handled).toBe(false) // not for us
  })

  it('rejects bad method with 405', async () => {
    const req = makeReq('/v1/admin/api-keys', 'PUT', { name: 'x' }, ADMIN_AUTH)
    const res = makeRes()
    const handled = await handleApiKeysRoutes('PUT', '/v1/admin/api-keys', req, res, '127.0.0.1')
    expect(handled).toBe(true)
    expect(res._s).toBe(405)
  })
})

describe('handleApiKeysRoutes — internal (openclaw-webhook hot path)', () => {
  beforeEach(() => {
    reset()
  })

  it('lookup: requires X-Internal-Key', async () => {
    const req = makeReq('/v1/internal/api-keys/lookup?prefix=wk_kvlGr', 'GET')
    const res = makeRes()
    const handled = await handleApiKeysRoutes('GET', '/v1/internal/api-keys/lookup?prefix=wk_kvlGr', req, res, '127.0.0.1')
    expect(handled).toBe(true)
    expect(res._s).toBe(401)
  })

  it('lookup: rejects wrong internal key', async () => {
    const req = { ...makeReq('/v1/internal/api-keys/lookup?prefix=wk_kvlGr', 'GET'), headers: { 'x-internal-key': 'wrong-key' } }
    const res = makeRes()
    const handled = await handleApiKeysRoutes('GET', '/v1/internal/api-keys/lookup?prefix=wk_kvlGr', req, res, '127.0.0.1')
    expect(handled).toBe(true)
    expect(res._s).toBe(401)
  })

  it('lookup: requires prefix query param', async () => {
    const req = { ...makeReq('/v1/internal/api-keys/lookup', 'GET'), headers: { 'x-internal-key': INTERNAL_KEY } }
    const res = makeRes()
    const handled = await handleApiKeysRoutes('GET', '/v1/internal/api-keys/lookup', req, res, '127.0.0.1')
    expect(handled).toBe(true)
    expect(res._s).toBe(400)
  })

  it('lookup: returns hash + scopes for known prefix', async () => {
    // Pre-populate a key
    state.keys.push({
      id: 'wk_test123',
      keyPrefix: 'wk_kvlGr',
      apiKeyHash: 'abc123',
      name: 'bootstrap',
      scopes: 'live-chat,webhook-request,blog-pipeline',
      createdAt: new Date(),
      createdBy: 'cli-bootstrap',
      lastUsedAt: null,
      lastUsedIp: null,
      revokedAt: null,
      revokedBy: null,
      expiresAt: null,
      notes: null,
    })

    const req = { ...makeReq('/v1/internal/api-keys/lookup?prefix=wk_kvlGr', 'GET'), headers: { 'x-internal-key': INTERNAL_KEY } }
    const res = makeRes()
    const handled = await handleApiKeysRoutes('GET', '/v1/internal/api-keys/lookup?prefix=wk_kvlGr', req, res, '127.0.0.1')
    expect(handled).toBe(true)
    expect(res._s).toBe(200)
    const body = JSON.parse(res._b)
    expect(body.id).toBe('wk_test123')
    expect(body.apiKeyHash).toBe('abc123')
    expect(body.scopes).toEqual(['live-chat', 'webhook-request', 'blog-pipeline'])
  })

  it('lookup: returns 404 for unknown prefix', async () => {
    const req = { ...makeReq('/v1/internal/api-keys/lookup?prefix=wk_unkno', 'GET'), headers: { 'x-internal-key': INTERNAL_KEY } }
    const res = makeRes()
    const handled = await handleApiKeysRoutes('GET', '/v1/internal/api-keys/lookup?prefix=wk_unkno', req, res, '127.0.0.1')
    expect(handled).toBe(true)
    expect(res._s).toBe(404)
  })
})

// ─── F6: Audit meta includes prefix + path for failed key attempts ──

describe('F6: audit meta includes prefix + path', () => {
  beforeEach(() => {
    reset()
  })

  it('verify: unknown prefix audit includes prefix and path', async () => {
    // A key that is long enough (>=16 chars) but doesn't exist in the DB.
    // We call internalVerify so verifyApiKey runs with the real hashing + mocked db.
    const fakeKey = 'wk_unknownkey1234567890'
    const req = {
      method: 'POST',
      url: '/v1/internal/api-keys/verify',
      headers: {
        'x-internal-key': INTERNAL_KEY,
        'x-webhook-key': fakeKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ requiredScope: 'live-chat' }),
      ip: '127.0.0.1',
    }
    const res = makeRes()
    const handled = await handleApiKeysRoutes('POST', '/v1/internal/api-keys/verify', req as any, res, '127.0.0.1')
    expect(handled).toBe(true)
    expect(res._s).toBe(401)

    // Find the audit entry for this failed attempt
    const audit = state.audits.find((a) => a.action === 'use_failed')
    expect(audit).toBeTruthy()
    const meta = audit!.meta ? JSON.parse(audit!.meta) : null
    expect(meta).toBeTruthy()
    expect(meta.reason).toBe('unknown_prefix')
    expect(meta.prefix).toBe(fakeKey.slice(0, 8))
    expect(meta.path).toBe('/v1/internal/api-keys/verify')
    // The webhookPath column should also be set
    expect(audit!.webhookPath).toBe('/v1/internal/api-keys/verify')
  })

  it('verify: malformed key audit includes prefix and path', async () => {
    // A key that is too short (< 16 chars) triggers the 'malformed' branch
    const shortKey = 'wk_short'
    const req = {
      method: 'POST',
      url: '/v1/internal/api-keys/verify',
      headers: {
        'x-internal-key': INTERNAL_KEY,
        'x-webhook-key': shortKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
      ip: '127.0.0.1',
    }
    const res = makeRes()
    const handled = await handleApiKeysRoutes('POST', '/v1/internal/api-keys/verify', req as any, res, '127.0.0.1')
    expect(handled).toBe(true)
    expect(res._s).toBe(401)

    const audit = state.audits.find((a) => a.action === 'use_failed')
    expect(audit).toBeTruthy()
    const meta = audit!.meta ? JSON.parse(audit!.meta) : null
    expect(meta).toBeTruthy()
    expect(meta.reason).toBe('malformed')
    expect(meta.prefix).toBe(shortKey.slice(0, 8))
    expect(meta.path).toBe('/v1/internal/api-keys/verify')
    expect(audit!.webhookPath).toBe('/v1/internal/api-keys/verify')
  })

  it('verify: missing key audit includes path', async () => {
    // No X-Webhook-Key header at all → 'missing' branch
    const req = {
      method: 'POST',
      url: '/v1/internal/api-keys/verify',
      headers: {
        'x-internal-key': INTERNAL_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
      ip: '127.0.0.1',
    }
    const res = makeRes()
    const handled = await handleApiKeysRoutes('POST', '/v1/internal/api-keys/verify', req as any, res, '127.0.0.1')
    expect(handled).toBe(true)
    expect(res._s).toBe(401)

    const audit = state.audits.find((a) => a.action === 'use_failed')
    expect(audit).toBeTruthy()
    const meta = audit!.meta ? JSON.parse(audit!.meta) : null
    expect(meta).toBeTruthy()
    expect(meta.reason).toBe('missing')
    expect(meta.path).toBe('/v1/internal/api-keys/verify')
    expect(audit!.webhookPath).toBe('/v1/internal/api-keys/verify')
  })
})

// ─── F9: TOCTOU race in rotateKey (concurrent rotation test) ────────

describe('F9: rotateKey TOCTOU race', () => {
  beforeEach(() => {
    reset()
  })

  it('concurrent rotation: exactly one succeeds, no double-insert', async () => {
    // Create a key to rotate
    const createReq = makeReq('/v1/admin/api-keys', 'POST', { name: 'race-key', scopes: 'live-chat' }, ADMIN_AUTH)
    const createRes = makeRes()
    await handleApiKeysRoutes('POST', '/v1/admin/api-keys', createReq, createRes, '127.0.0.1')
    const created = JSON.parse(createRes._b)
    const oldId = created.id

    // Count keys before rotation
    const keysBefore = state.keys.length

    // Spawn two concurrent rotations on the same keyId
    const rotateReq1 = makeReq(`/v1/admin/api-keys/${oldId}/rotate`, 'POST', undefined, ADMIN_AUTH)
    const rotateReq2 = makeReq(`/v1/admin/api-keys/${oldId}/rotate`, 'POST', undefined, ADMIN_AUTH)
    const res1 = makeRes()
    const res2 = makeRes()

    // The mock db.transaction is async but NOT truly concurrent — it runs
    // the callback synchronously in a microtask. With Promise.all, the
    // first rotation will complete (revoking the old key), and the second
    // will see revokedAt set and return 409.
    //
    // However, since the mock transaction doesn't use real DB locking, we
    // need to ensure they actually race. We use Promise.all to kick both
    // off — the mock's transaction resolves sequentially.
    const [result1, result2] = await Promise.all([
      handleApiKeysRoutes('POST', `/v1/admin/api-keys/${oldId}/rotate`, rotateReq1, res1, '127.0.0.1'),
      handleApiKeysRoutes('POST', `/v1/admin/api-keys/${oldId}/rotate`, rotateReq2, res2, '127.0.0.1'),
    ])

    // At least one must succeed (201)
    const s1 = res1._s
    const s2 = res2._s

    // Exactly one should be 201 (success) and the other should be 409 (already revoked)
    const successCount = [s1, s2].filter((s) => s === 201).length
    const conflictCount = [s1, s2].filter((s) => s === 409).length
    expect(successCount).toBe(1)
    expect(conflictCount).toBe(1)

    // No double-insert: only ONE new key should have been added
    const keysAfter = state.keys.length
    expect(keysAfter - keysBefore).toBe(1)

    // The old key must be revoked
    const oldKey = state.keys.find((k) => k.id === oldId)
    expect(oldKey?.revokedAt).toBeInstanceOf(Date)

    // Exactly ONE 'rotate' audit event for the old keyId
    const rotateAudits = state.audits.filter((a) => a.action === 'rotate' && a.keyId === oldId)
    expect(rotateAudits.length).toBe(1)
  })
})

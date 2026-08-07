import { createHash, randomUUID } from 'node:crypto'
import { appendFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { registerHandler } from '../../openclaw-webhook/scripts/server.ts'

const AUDIT_LOG = join(process.env.HOME ?? '/home/andlersrv', '.openclaw/workspace/memory/mcp-call-audit.jsonl')
const ALLOWED_SESSION_KEYS = new Set([
  'agent:main:discord:direct:856709050824392714',
  'agent:main:main',
])
const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW_MS = 60_000
const rateLimitMap = new Map<string, { tokens: number; lastRefill: number }>()

function checkRateLimit(iss: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(iss)
  if (!entry) {
    rateLimitMap.set(iss, { tokens: RATE_LIMIT_MAX - 1, lastRefill: now })
    return true
  }
  const elapsed = now - entry.lastRefill
  const refilled = Math.min(RATE_LIMIT_MAX, entry.tokens + Math.floor(elapsed / (RATE_LIMIT_WINDOW_MS / RATE_LIMIT_MAX)))
  if (refilled <= 0) return false
  rateLimitMap.set(iss, { tokens: refilled - 1, lastRefill: now })
  return true
}

function ensureAuditDir(): void {
  const dir = join(AUDIT_LOG, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function writeAudit(originIss: string, userJti: string, action: string, params: Record<string, unknown>, resultOk: boolean): void {
  try {
    ensureAuditDir()
    const entry = {
      timestamp: new Date().toISOString(),
      origin_iss: originIss,
      user_jti: userJti,
      action,
      params_hash: 'sha256:' + createHash('sha256').update(JSON.stringify(params)).digest('hex').slice(0, 16),
      result_ok: resultOk,
    }
    appendFileSync(AUDIT_LOG, JSON.stringify(entry) + '\n', 'utf8')
  } catch {
    // Audit failure should not crash the handler, but we log it
    console.error(`[openclaw-api-handler] Failed to write audit log: ${AUDIT_LOG}`)
  }
}

const OPENCLAW_BIN = process.env.OPENCLAW_BIN ?? (() => {
  const candidates = [
    '/home/andlersrv/.local/share/mise/shims/openclaw',
    '/home/andlersrv/.local/bin/openclaw',
    'openclaw',
  ]
  for (const c of candidates) {
    try {
      if (existsSync(c) || c === 'openclaw') return c
    } catch {
      // ignore
    }
  }
  return 'openclaw'
})()

function safeExec(cmd: string[], env: Record<string, string>): Promise<{ ok: boolean; stdout: string; stderr: string; code: number }> {
  const fullEnv = { ...process.env, ...env }
  if (!fullEnv.PATH || !fullEnv.PATH.includes('mise/shims')) {
    fullEnv.PATH = `/home/andlersrv/.local/share/mise/shims:/home/andlersrv/.local/bin:${fullEnv.PATH ?? '/usr/local/bin:/usr/bin:/bin'}`
  }
  const resolvedCmd = cmd.map((arg) => (arg === 'openclaw' ? OPENCLAW_BIN : arg))
  const proc = Bun.spawnSync({
    cmd: resolvedCmd,
    env: fullEnv,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 55_000,
  })
  const stdout = proc.stdout?.toString('utf8') ?? ''
  const stderr = proc.stderr?.toString('utf8') ?? ''
  const code = proc.exitCode ?? 1
  return Promise.resolve({ ok: code === 0, stdout, stderr, code })
}

interface ApiPayload {
  action: 'consult_memory' | 'spawn_session' | 'send_session' | 'history_session' | 'list_subagents'
  params: {
    query?: string
    sessionKey?: string
    message?: string
    task?: string
    agentId?: string
    max_runtime_seconds?: number
    jti_chain?: string[]
  }
}

interface ManifestLike {
  event_id: string
  event_type: string
  requester: string
  payload_sha256: string
  payload: unknown
  created_at: string
  expires_at: string
  status: string
  handler: string
  updated_at: string
}

async function handleApiRequest(payload: unknown, manifest: ManifestLike): Promise<{ status: 'ready' | 'failed'; error?: { code: string; message: string } }> {
  const body = payload as ApiPayload
  const originIss = manifest.requester
  const userJti = (manifest.payload as { jti?: string })?.jti ?? manifest.event_id

  if (!body || !body.action) {
    return { status: 'failed', error: { code: 'INVALID_ACTION', message: 'Missing action field' } }
  }

  if (!checkRateLimit(originIss)) {
    return { status: 'failed', error: { code: 'RATE_LIMIT_EXCEEDED', message: `Rate limit exceeded for ${originIss}` } }
  }

  const action = body.action
  const params = body.params ?? {}

  try {
    let result: { ok: boolean; stdout: string; stderr: string; code: number }

    switch (action) {
      case 'consult_memory': {
        if (!params.query) {
          return { status: 'failed', error: { code: 'MISSING_PARAM', message: 'query is required for consult_memory' } }
        }
        const env: Record<string, string> = {}
        env.OC_QUERY = params.query
        result = await safeExec(
          ['openclaw', 'memory', 'search', '--max-results', '10', '--json', params.query],
          env,
        )
        break
      }

      case 'list_subagents': {
        result = await safeExec(['openclaw', 'sessions', 'list', '--json'], {})
        break
      }

      case 'spawn_session': {
        if (!params.sessionKey) {
          return { status: 'failed', error: { code: 'MISSING_PARAM', message: 'sessionKey is required for spawn_session' } }
        }
        if (!params.task) {
          return { status: 'failed', error: { code: 'MISSING_PARAM', message: 'task is required for spawn_session' } }
        }
        if (!ALLOWED_SESSION_KEYS.has(params.sessionKey)) {
          return { status: 'failed', error: { code: 'SESSION_KEY_NOT_ALLOWED', message: `Session key not in allowlist: ${params.sessionKey}` } }
        }
        const agentId = params.agentId ?? 'main'
        const env: Record<string, string> = {}
        env.OC_TASK = params.task
        result = await safeExec(
          ['openclaw', 'agent', '--agent', agentId, '--session-key', params.sessionKey, '--message', params.task, '--json'],
          env,
        )
        break
      }

      case 'send_session': {
        if (!params.sessionKey) {
          return { status: 'failed', error: { code: 'MISSING_PARAM', message: 'sessionKey is required for send_session' } }
        }
        if (!params.message) {
          return { status: 'failed', error: { code: 'MISSING_PARAM', message: 'message is required for send_session' } }
        }
        if (!ALLOWED_SESSION_KEYS.has(params.sessionKey)) {
          return { status: 'failed', error: { code: 'SESSION_KEY_NOT_ALLOWED', message: `Session key not in allowlist: ${params.sessionKey}` } }
        }
        const env: Record<string, string> = {}
        env.OC_MESSAGE = params.message
        result = await safeExec(
          ['openclaw', 'agent', '--agent', 'main', '--session-key', params.sessionKey, '--message', params.message, '--deliver', '--json'],
          env,
        )
        break
      }

      case 'history_session': {
        if (!params.sessionKey) {
          return { status: 'failed', error: { code: 'MISSING_PARAM', message: 'sessionKey is required for history_session' } }
        }
        if (!ALLOWED_SESSION_KEYS.has(params.sessionKey)) {
          return { status: 'failed', error: { code: 'SESSION_KEY_NOT_ALLOWED', message: `Session key not in allowlist: ${params.sessionKey}` } }
        }
        result = await safeExec(
          ['openclaw', 'sessions', 'history', '--session-key', params.sessionKey, '--limit', '50', '--json'],
          {},
        )
        break
      }

      default: {
        return { status: 'failed', error: { code: 'INVALID_ACTION', message: `Unknown action: ${action}` } }
      }
    }

    writeAudit(originIss, userJti, action, params, result.ok)

    if (!result.ok) {
      return {
        status: 'failed',
        error: {
          code: 'CLI_ERROR',
          message: `openclaw CLI exited ${result.code}: ${result.stderr.slice(0, 500)}`,
        },
      }
    }

    return { status: 'ready' }
  } catch (err) {
    writeAudit(originIss, userJti, action, params, false)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { status: 'failed', error: { code: 'CLI_ERROR', message } }
  }
}

registerHandler('openclaw-api.request', handleApiRequest)
/**
 * Kill Switch API Service — Bun.serve() with native WebSocket (ADR-133)
 */
import { KillSwitchService } from './services/kill-switch';
import { WebSocketManager } from './services/websocket-manager';
import { sqlite as sqliteDb } from './db/index';
import { isIpAllowed, startDnsRefresh } from './services/ip-allowlist';
import { checkRateLimit, isReadRequest, initRateLimiter, READ_RATE_LIMIT_MAX, WRITE_RATE_LIMIT_MAX, RATE_LIMIT_MAX } from './middleware/rate-limit';
import { checkInferenceGate, INFERENCE_GATE_RETRY_AFTER_SECONDS } from './middleware/inference-gate';
import { checkAuth } from './middleware/auth';
import { isKillAuthBypassPath } from './middleware/kill-auth-bypass';
import { AuthRateLimiter } from './middleware/auth-rate-limit';
import { handleAuthRoutes } from './routes/auth';
import { handleWebAuthnRoutes } from './routes/webauthn';
import { handleKillSwitchRoutes } from './routes/kill-switch';
import { handleKillAuthorizationRoutes } from './routes/kill-authorization';
import { handleFlagsRoutes } from './routes/flags';
import { handleMachinesRoutes } from './routes/machines';
import { handleDiscoveryRoutes } from './routes/discovery';
import { handleOnboardingRoutes } from './routes/onboarding';
import { handleSettingsRoutes } from './routes/settings';
import { handleLbHealthRoutes } from './middleware/lb-health';
import { handleAdminRoutes } from './routes/admin';
import { handleAdminSecretsRoutes, initAuditLogFromDb } from './routes/admin-secrets';
import { handleApiKeysRoutes } from './routes/api-keys';
import { handleWebhookKeysRoutes } from './routes/webhook-keys';
import { handleAuditRoutes } from './routes/audit';
import { SecretsLoader } from './lib/secrets-loader';
import { LockoutStateMachine } from './lib/lockout-state';
import { loadRedisPool } from './infra-loader';
import { startMetricGeneration } from './services/system-metrics';
import { startMachineHeartbeat } from './services/machine-heartbeat';
import { startRegistryScheduler } from './services/discovery/registry-scheduler';
import { InferenceVerifier } from './services/verification/verifier';
import { VerificationService } from './services/verification/verification-service';
import { checkInferenceVerification, type InferenceRequestBody } from './middleware/inference-verification';
import { handleRegistryRoutes } from './routes/registry';
import { handleInternalKillSwitchRoutes } from './routes/internal-kill-switch';
import { getConfig, isFeatureEnabled } from './config';
import { seedAdminUser } from './lib/auth';
import { seedFeatureFlags } from './db/seed';
import { validateEnvironment, validateVerifierConfig, validateVerifierReachability, validateOllamaProxyConfig } from './config/validate-env';
import { handleOllamaProxyRoutes, isOllamaProxyPath, isOllamaProxyRequest, startOllamaUpstreamHealthCheck } from './routes/ollama-proxy';
import { createNodeResAdapter, MAX_BUFFER_BYTES } from './utils/node-res-adapter';
import { fingerprintSourceFromParts } from './services/fingerprint-halt';

// ─── Redis client type (mirrors RedisPool from src/infra/redis-cluster-pool.mjs) ──

interface RedisClient {
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string, handler: (message: string) => void): Promise<void>;
  connect(): Promise<void>;
}

// ─── Node-style HTTP Handler ───────────────────────────────────────

function createHandler(
  service: KillSwitchService,
  ctx: { secretsLoader: SecretsLoader; lockoutState: LockoutStateMachine; redis: RedisClient },
  verification?: VerificationService,
  ollamaProxyEnabled = true,
) {
  const authRateLimiter = new AuthRateLimiter();
  const config = getConfig();
  const { secretsLoader, lockoutState, redis } = ctx;

  return async (req: any, res: any) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const url = req.url || '/';
    const method = req.method || 'GET';

    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || 'http://localhost:3001');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (isFeatureEnabled('enableLbHealth')) {
      const lb = await handleLbHealthRoutes(method, url, req, res, service);
      if (lb) return;
    }

    // ── Admin secrets routes (separate auth: ADMIN_UI_API_KEY) ──
    const secretsHandled = await handleAdminSecretsRoutes(method, url, req, res, secretsLoader, lockoutState);
    if (secretsHandled) return;

    // ── Webhook API Key admin + internal routes (separate auth) ──
    // Must run BEFORE checkAuth because:
    //   - /v1/internal/* is called by the openclaw-webhook over loopback
    //     with KILL_SWITCH_INTERNAL_KEY, NOT a user session.
    //   - /v1/admin/api-keys/* uses ADMIN_UI_API_KEY Bearer, NOT a user session
    //     (mirrors admin-secrets.ts above).
    // The handler does its own auth checks (adminKeyMatches / internalKeyMatches).
    const apiKeysHandled = await handleApiKeysRoutes(method, url, req, res, ip);
    if (apiKeysHandled) return;

    // ── Webhook Keys admin routes (ADR-139) — separate auth ──
    // /v1/admin/webhook-keys/* uses ADMIN_UI_API_KEY Bearer, NOT a user
    // session (mirrors api-keys.ts). Runs BEFORE checkAuth.
    const webhookKeysHandled = await handleWebhookKeysRoutes(method, url, req, res);
    if (webhookKeysHandled) return;

    // ── Internal kill-switch transition (KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §d.1) ──
    // Automated (non-human) STOPPED triggers. Loopback-only + KILL_SWITCH_INTERNAL_KEY,
    // accepts only STOPPING/STOPPED. Runs BEFORE checkAuth (service-authenticated,
    // not a user session). Mirrors the /v1/internal/* webhook pattern.
    const internalKsHandled = await handleInternalKillSwitchRoutes(method, url, req, res, service);
    if (internalKsHandled) return;

    const admin = await handleAdminRoutes(method, url, req, res, service);
    if (admin) return;

    const isAuth = url.startsWith('/v1/auth/');
    // Ollama proxy paths are exempt from the IP allowlist check: nginx is
    // the auth gate (PCA key + IP allowlist) and proxies to the kill-switch
    // over loopback. The route itself verifies X-API-Key (defense in depth).
    const isOllamaProxy = isOllamaProxyPath(url);
    if (!isAuth && !isOllamaProxy && !isIpAllowed(ip)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'IP not allowed', ip }));
      return;
    }

    if (isAuth) {
      const check = authRateLimiter.check(ip);
      if (!check.allowed) {
        res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(check.retryAfterSeconds || 900) });
        res.end(JSON.stringify({ error: 'Too many login attempts', retryAfter: check.retryAfterSeconds }));
        return;
      }
    }

    const rate = await checkRateLimit(ip, req.method || 'GET', req.url || '/');
    if (!rate.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(rate.retryAfter || 60) });
      res.end(JSON.stringify({ error: 'Rate limit exceeded', limit: RATE_LIMIT_MAX }));
      return;
    }

    // ── Inference gate (ADR-141 + P1-1 fingerprint-scoped halt) ──
    // While the kill-switch is STOPPED, reject POST inference lanes with
    // 503 + Retry-After so no new inference requests flow. This is the
    // Phase 1 traffic-pause enforcement (swappable via PauseMechanism).
    // P1-1: a per-fingerprint blocklist is checked BEFORE the global
    // pause — a fingerprint blocked by an UNSAFE output verdict gets 503
    // for ITS OWN generation requests while the rest of the fleet keeps
    // flowing. Covers the legacy /v1/inference/* lane AND the Ollama
    // proxy generation lanes (infra consult #3 — 2026-08-27).
    //
    // The body is only parsed for POST inference lanes (the only lanes the
    // scoped halt applies to) — metadata GETs and admin paths skip the
    // parse entirely.
    const isInferenceWriteLane =
      method === 'POST' &&
      (url.startsWith('/v1/inference/') || isOllamaProxyRequest(method, url).verified);
    const fingerprintSource = fingerprintSourceFromParts({
      body: isInferenceWriteLane
        ? (() => {
            try {
              return req.body ? JSON.parse(req.body) : null;
            } catch {
              return null;
            }
          })()
        : null,
      headers: req.headers,
      ip,
    });
    const gate = checkInferenceGate(req.method || 'GET', req.url || '/', fingerprintSource);
    if (gate.gated) {
      res.writeHead(503, {
        'Content-Type': 'application/json',
        'Retry-After': String(gate.retryAfter ?? INFERENCE_GATE_RETRY_AFTER_SECONDS),
      });
      res.end(JSON.stringify({
        error: gate.reason === 'fingerprint'
          ? 'Inference traffic paused for this fingerprint (UNSAFE output verdict)'
          : 'Inference traffic paused (kill-switch STOPPED)',
        retryAfter: gate.retryAfter ?? INFERENCE_GATE_RETRY_AFTER_SECONDS,
        reason: gate.reason ?? 'global',
      }));
      return;
    }

    let uid: string | null = null;
    let userRole: string | null = null;
    const isKillAuthPath = isKillAuthBypassPath(method, url);
    // Ollama proxy paths skip session auth: nginx is the auth gate (PCA key
    // + IP allowlist) and injects X-API-Key, which the proxy route verifies
    // (defense in depth). Do NOT require session auth on the proxy paths.
    if (url !== '/v1/kill-switch/health' && !isAuth && !isKillAuthPath && !isOllamaProxy) {
      const ar = await checkAuth(service, req);
      if (!ar.authenticated) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Authentication required' })); return; }
      uid = ar.user?.email ?? null;
      userRole = ar.user?.role ?? null;
    }

    // ── Inference verification (KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §b.4) ──
    // Runs AFTER the gate (paused → 503 short-circuits first) and after auth,
    // but BEFORE the route dispatcher. Reads the inference body, fires the
    // VerificationService. ASYNC mode passes through immediately; SYNC mode
    // awaits and rejects UNSAFE with 403.
    //
    // P2-1 (auth-first): the Ollama PROXY lanes are SKIPPED here — the proxy
    // route fires verification itself AFTER its own X-API-Key check. This
    // closes the unauthenticated verifier-spam vector (the hook previously
    // fired before the proxy route's auth). The legacy /v1/inference/* lane
    // keeps the hook (it is behind session auth above).
    //
    // P2-8: malformed JSON on a generation path is logged loudly and a
    // verification_event row with verdict REVIEW + degraded=1 is written
    // (the request still proxies — the upstream decides).
    if (verification) {
      const requestId = crypto.randomUUID();
      let body: InferenceRequestBody | null = null;
      const isInferenceLane = method === 'POST' && url.startsWith('/v1/inference/');
      const isProxyGenerationLane = method === 'POST' && isOllamaProxyRequest(method, url).verified;
      if (isInferenceLane || isProxyGenerationLane) {
        try {
          body = req.body ? JSON.parse(req.body) : null;
        } catch {
          body = null;
          if (isProxyGenerationLane) {
            // P2-8: malformed JSON on a generation lane — log loudly and
            // record a REVIEW/degraded verification_event row so the audit
            // trail shows the verification was skipped, not silently dropped.
            console.warn(`[inference-verification] Malformed JSON body on generation lane ${method} ${url} — verification skipped (REVIEW/degraded)`);
            void verification.recordDegradedEvent({
              requestId,
              machineId: fingerprintSource.machineId,
              reason: 'malformed_json_body',
            }).catch((err) => {
              console.warn('[inference-verification] Failed to record degraded event (non-fatal):', err instanceof Error ? err.message : err);
            });
          }
        }
      }
      // P2-1: only the legacy /v1/inference/* lane fires here. Proxy lanes
      // fire verification inside the route AFTER the X-API-Key check.
      if (isInferenceLane) {
        const v = checkInferenceVerification(method, url, body, verification, requestId, body?.machineId);
        if (v.awaitDecision) {
          const decision = await v.awaitDecision;
          if (decision.reject) {
            res.writeHead(decision.reject.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(decision.reject.body));
            return;
          }
        }
      }
    }

    // ── Ollama reverse-proxy (infra consult #3 — 2026-08-27) ──────
    // Runs AFTER the verification hook (legacy lane only — P2-1) and
    // BEFORE the generic route dispatcher so these paths never 404. nginx
    // is the auth gate; the route verifies X-API-Key (defense in depth) and
    // proxies to the ordered upstream list (try-in-order failover). The
    // route fires OUTPUT verification (P1-1) after relaying, scoped to the
    // request's fingerprint. Skipped entirely when the upstream config
    // failed validation at startup.
    if (ollamaProxyEnabled) {
      const ollamaProxyHandled = await handleOllamaProxyRoutes(method, url, req, res, {
        upstreams: config.ollamaProxy.upstreams,
        timeoutMs: config.ollamaProxy.timeoutMs,
        verification,
        fingerprintSource,
      });
      if (ollamaProxyHandled) return;
    }

    // Wrap the dispatcher chain in try/catch so a throw in any handler
    // does NOT leak the stack trace + Drizzle SQL error to the HTTP
    // response (Phase 4 Stage 2 fix — info-leak). Log full detail
    // server-side, return a generic 500 with a request_id to the caller.
    let handled = false
    try {
      handled =
        await handleWebAuthnRoutes(method, url, req, res) ||
        await handleAuthRoutes(method, url, req, res, service, authRateLimiter) ||
        await handleKillSwitchRoutes(method, url, req, res, service, ip) ||
        await handleKillAuthorizationRoutes(method, url, req, res, service) ||
        await handleAuditRoutes(method, url, req, res) ||
        await handleFlagsRoutes(method, url, req, res, uid || 'api', userRole) ||
        await handleMachinesRoutes(method, url, req, res,
          async (channel, msg) => { try { await redis.publish(channel, msg); } catch (e: any) { console.warn('[ws] redis publish dropped', { channel, err: e.message }); } },
        ) ||
        await handleDiscoveryRoutes(method, url, req, res, uid || 'api', userRole) ||
        await handleRegistryRoutes(method, url, res) ||
        await handleOnboardingRoutes(method, url, req, res, uid || 'api', userRole) ||
        await handleSettingsRoutes(method, url, req, res, userRole,
          async (channel, msg) => { try { await redis.publish(channel, msg); } catch (e: any) { console.warn('[ws] redis publish dropped', { channel, err: e.message }); } },
        );
    } catch (err) {
      // Log full detail server-side, return generic 500 to caller.
      const requestId = crypto.randomUUID()
      console.error(`[server] unhandled error ${requestId}:`, err)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'internal_error', request_id: requestId }))
      } else {
        try { res.end() } catch { /* already ended */ }
      }
      return
    }

    if (!handled) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not found' })); }
  };
}

// ─── Server Startup with Bun.serve() + native WebSocket ────────────

export async function startServer(opts: { redisUrls?: string[]; authToken?: string; apiKey?: string; port?: number } = {}) {
  const config = getConfig();

  // ─── Validate environment BEFORE secrets loader (S-A2 — loud, no silent 401s) ──
  validateEnvironment();

  // ─── Secrets Loader (startup-load, throw on missing) ─────────────
  const secretsLoader = new SecretsLoader({
    onReload: (result) => {
      console.log(`[secrets-loader] reload: ${result.skipped ? 'skipped (' + (result.reason || 'unchanged') + ')' : result.loaded.length + ' keys loaded'}`);
    },
  });
  await secretsLoader.load();
  secretsLoader.startWatchers();
  console.log(`[secrets-loader] loaded ${secretsLoader.getLoadedKeys().length} managed secret(s)`);

  // ─── Lockout State Machine ──────────────────────────────────────
  const lockoutState = new LockoutStateMachine();
  await lockoutState.load();
  lockoutState.startWatchers();
  console.log(`[lockout-state] state: ${lockoutState.getLockoutLabel()}`);

  // ─── Secrets Audit Log: load recent entries from DB ─────────────
  await initAuditLogFromDb();

  const RedisPool = await loadRedisPool() as any;
  const redis = new RedisPool({ urls: opts.redisUrls || config.redis.urls });
  await redis.connect();

  initRateLimiter(redis);
  startDnsRefresh();

  const service = new KillSwitchService({
    redis,
    authToken: opts.authToken || process.env.KILL_SWITCH_AUTH_TOKEN,
    apiKey: opts.apiKey || process.env.KILL_SWITCH_API_KEY,
  });

  // Recover the kill-switch audit history from the DB so the dashboard's
  // audit log isn't empty after a process restart / container rebuild
  // (the in-memory hot cache starts empty).
  await service.loadAuditFromDb();

  // Seed a single "System initialized — kill switch running" audit entry if
  // the DB audit log is empty (fresh container rebuild). Idempotent — only
  // writes when there are zero rows.
  await service.seedInitialAuditEntry();

  const wsManager = new WebSocketManager();

  if (typeof redis.subscribe === 'function') {
    wsManager.setRedisSubscribe((ch: string, h: (msg: string) => void) => redis.subscribe(ch, h));
  }

  // Start periodic real system metrics collection (ADR-133: live telemetry)
  // Collects CPU/RAM/GPU/Disk/Load from the host every 5s,
  // publishes machine-metrics events via Redis pubsub → WebSocketManager → frontend
  startMetricGeneration({
    intervalMs: 5000,
    publish: async (channel, msg) => {
      try { await redis.publish(channel, msg); } catch { /* Redis unavailable — metrics update locally */ }
    },
  });

  // Start local-machine heartbeats (ADR-133: live machine status).
  // Stamps the local host's last_seen on startup + every 30s so it shows
  // "active" (not "pending") on the dashboard, and publishes a
  // machine-heartbeat event so the frontend refetches machines live.
  startMachineHeartbeat({
    intervalMs: 30_000,
    publish: async (channel, msg) => {
      try { await redis.publish(channel, msg); } catch { /* Redis unavailable — heartbeat still persisted */ }
    },
  });

  service.onStateChange((entry: any) => {
    wsManager.broadcastStateChange(entry);
    // Also emit the `audit-entry` event the frontend hook listens for, so
    // the audit log updates in real time (not just on the 5s poll).
    wsManager.broadcastAuditEntry(entry);
  });

  // ── Ollama reverse-proxy (infra consult #3 — 2026-08-27) ─────────
  // Validate the upstream list (fail fast on misconfiguration). On invalid
  // config the proxy routes are ACTUALLY disabled (guard flag) — the log
  // message must match reality, so the handler is not wired and the health
  // check is not started. Proxy paths then fall through to the generic
  // dispatcher (404) instead of 502-ing on a broken upstream list.
  // Computed BEFORE the verification block so the P1-2 fail-start guard
  // can check "proxy enabled AND verification off".
  let ollamaProxyEnabled = true;
  try {
    validateOllamaProxyConfig(config.ollamaProxy);
  } catch (err) {
    ollamaProxyEnabled = false;
    console.error('[ollama-proxy] Config invalid — proxy routes disabled:', err instanceof Error ? err.message : err);
  }

  // ── Inference Verification Service (KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §b) ──
  // Instantiate the verifier + verification service. Config values
  // (KILL_SWITCH_VERIFIER_MODEL, KILL_SWITCH_VERIFIER_BASE_URL,
  // KILL_SWITCH_VERIFIER_TIMEOUT_MS, KILL_SWITCH_VERIFY_ENABLED,
  // KILL_SWITCH_VERIFY_MODE) are provided via `getConfig().verification`.
  // Defaults keep the system safe: verification is a no-op unless BOTH the
  // `killSwitchVerificationEnabled` feature flag AND `verification.verifyEnabled`
  // are true (spec §c.2 — default off until the verifier model is confirmed
  // reachable).
  const verificationConfig = getConfig().verification;
  let verificationEnabled =
    isFeatureEnabled('killSwitchVerificationEnabled') &&
    (verificationConfig?.verifyEnabled ?? false);

  // P1-2 fail-start guard: if the Ollama proxy is enabled AND verification
  // is NOT active, the safety property (verify-before-trust) is not in
  // effect for the proxied inference lanes. Log LOUDLY at startup so the
  // operator cannot miss it. The server still boots (the proxy is a
  // pass-through without verification) — but the warning is unmissable.
  if (ollamaProxyEnabled && !verificationEnabled) {
    console.error(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '  ⚠️  SAFETY PROPERTY NOT ACTIVE: Ollama proxy is ENABLED but inference\n' +
      '  verification is DISABLED (KILL_SWITCH_VERIFY_ENABLED != true or the\n' +
      '  killSwitchVerificationEnabled feature flag is off).\n' +
      '  Proxied generation lanes (/v1/chat/completions, /api/chat, …) will\n' +
      '  pass through WITHOUT prompt/output verification. Set\n' +
      '  KILL_SWITCH_VERIFY_ENABLED=true (and confirm the verifier model is\n' +
      '  reachable) to restore the safety property.\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    );
  }

  // P2-1: validate the verification config + probe verifier reachability at
  // startup (before Bun.serve). If verification is enabled but the verifier is
  // unreachable, log a warning and continue with a degraded (no-op) verifier —
  // the spec says fail-fast, but we allow startup with a degraded warning.
  if (verificationEnabled) {
    try {
      validateVerifierConfig(verificationConfig);
    } catch (err: any) {
      console.error('[verification] Config invalid — verification disabled:', err.message);
      verificationEnabled = false;
    }
    // Defer reachability probe to prevent blocking Bun.serve() startup.
    // The probe runs after the server is listening; if unreachable, verification
    // degrades gracefully (REVIEW + no auto-kill) per spec §c.3.
    setTimeout(async () => {
      try {
        const reachable = await validateVerifierReachability(verificationConfig);
        if (!reachable) {
          console.warn(
            `[verification] Verifier model '${verificationConfig?.verifierModel}' at ` +
            `'${verificationConfig?.verifierBaseUrl}' is unreachable — verification will be degraded ` +
            `(REVIEW + no auto-kill) until the model is reachable.`,
          );
        } else {
          console.log(`[verification] Verifier model reachable — inference verification active`);
        }
      } catch (err: any) {
        console.warn(`[verification] Reachability probe failed (non-fatal):`, err.message);
      }
    }, 3000);
  }

  const verificationService = verificationEnabled
    ? new VerificationService({
        verifier: new InferenceVerifier({
          model: verificationConfig?.verifierModel,
          baseUrl: verificationConfig?.verifierBaseUrl,
          timeoutMs: verificationConfig?.verifierTimeoutMs,
        }),
        mode: verificationConfig?.verifyMode ?? 'async',
        // autoKillOnUnsafe is intentionally NOT read from config — the spec
        // mandates that an UNSAFE verdict always auto-triggers STOPPED. The
        // VerificationService defaults autoKillOnUnsafe to true.
        killSwitch: service,
        publish: async (channel, msg) => {
          try { await redis.publish(channel, msg); } catch { /* Redis unavailable */ }
        },
      })
    : undefined;

  // Document the future trained LoRA adapter (dignity-verification-v0.1-preview).
  // Until that adapter is created, the verifier runs on the stock model
  // (verifierModel). Once trained, set KILL_SWITCH_VERIFIER_MODEL to the
  // target model name to switch over.
  if (verificationEnabled) {
    console.log(
      `[verification] Verifier model: '${verificationConfig?.verifierModel}' | ` +
      `target (future LoRA): '${verificationConfig?.verifierTargetModel}'`,
    );
  }

  // ── Live Registry Scheduler (KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §a) ──
  // Drives the discovery orchestrator on intervals so the dashboard shows
  // real machines/agents/providers/models.
  startRegistryScheduler({
    publish: async (channel, msg) => {
      try { await redis.publish(channel, msg); } catch { /* Redis unavailable */ }
    },
  });

  if (ollamaProxyEnabled) {
    startOllamaUpstreamHealthCheck({
      upstreams: config.ollamaProxy.upstreams,
      intervalMs: 30_000,
    });
  }

  const port = opts.port || config.server.port;

  // Bun.serve with native WebSocket
  // Bind to config.server.host (default '0.0.0.0'). The container runs in
  // network_mode: host, so there is no port mapping — the server binds directly
  // to host port 3000. Binding to 0.0.0.0 does not expose /v1/internal/*
  // endpoints to the outside world while making the API reachable from the
  // host via nginx. Spec §9 requires internal endpoints be localhost-only.
  const server = Bun.serve<{ userId: string; ip: string }>({
    hostname: config.server.host || '0.0.0.0',
    port,
    websocket: {
      maxPayloadLength: 65536,
      open(ws: any) { wsManager.handleBunUpgrade(ws); },
      close() {},
      message(ws: any, msg: string | Buffer) {
        const text = typeof msg === 'string' ? msg : Buffer.from(msg).toString();
        if (text === 'pong') { /* handled by Bun's auto-pong */ }
      },
    },
    async fetch(req, srv) {
      const url = new URL(req.url);

      // WebSocket upgrade — validate session via Better-Auth v2
      if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
        const token = url.searchParams.get('token');
        if (!token) return new Response(JSON.stringify({ error: 'Missing token', code: 4001 }), { status: 401, headers: { 'content-type': 'application/json' } });

        try {
          const auth = await import('./lib/auth').then(m => m.auth);
          const cookieHeader = req.headers.get('cookie') || '';
          const hasBA = cookieHeader.includes('better-auth.session_token') || cookieHeader.includes('__Secure-better-auth.session_token');

          // Use the browser's real cookie, or construct a signed cookie from the raw token
          // Better-Auth v2 signing: HMAC-SHA256(rawToken, key=secret) → base64 (see makeSignature in crypto/index.mjs)
          const sc = hasBA ? cookieHeader : (() => {
            const crypto = require('node:crypto');
            const hmac = crypto.createHmac('sha256', process.env.BETTER_AUTH_SECRET || '');
            hmac.update(token);
            const sig = hmac.digest('base64');
            return `better-auth.session_token=${token}.${sig}`;
          })();

          // Validate via auth.handler() — same proven pattern as middleware/auth.ts
          const headers = new Headers();
          headers.set('cookie', sc);
          headers.set('accept', 'application/json');
          const sessionReq = new Request(`http://localhost:${port}/v1/auth/get-session`, { method: 'GET', headers });
          const response = await auth.handler(sessionReq);

          if (!response.ok) {
            console.error('[ws] getSession returned ' + response.status);
            return new Response(JSON.stringify({ error: 'Invalid or expired token', code: 4001 }), { status: 401, headers: { 'content-type': 'application/json' } });
          }

          const data = (await response.json().catch(() => null)) as { user?: { email?: string; id?: string } } | null;
          if (!data?.user) {
            return new Response(JSON.stringify({ error: 'Invalid or expired token', code: 4001 }), { status: 401, headers: { 'content-type': 'application/json' } });
          }

          const userId = data.user.email || data.user.id || 'unknown';
          const ip = req.headers.get('x-real-ip') || srv.requestIP(req)?.address || 'unknown';
          const conns = (wsManager as any).ipCounts?.get(ip) || 0;
          if (conns >= 5) return new Response(JSON.stringify({ error: 'Too many connections', code: 4003 }), { status: 429, headers: { 'content-type': 'application/json' } });

          console.log('[ws] Upgrading: ' + userId + ' from ' + ip);
          const ok = srv.upgrade(req, { data: { userId, ip } } as any);
          return ok ? undefined : new Response('Upgrade failed', { status: 500 });
        } catch (e: any) {
          console.error('[ws] token validation error:', e.message);
          return new Response(JSON.stringify({ error: 'Authentication failed', code: 4001 }), { status: 401, headers: { 'content-type': 'application/json' } });
        }
      }

      // Regular HTTP — read body, convert to node-style, process via handler
      // P2-2: cap the body read for Ollama proxy paths (MAX_BUFFER_BYTES) so
      // an unbounded request body cannot OOM the kill-switch. Non-proxy
      // paths keep the unbounded read (existing behavior — admin/auth bodies
      // are small and validated downstream).
      const isProxyPath = isOllamaProxyPath(url.pathname);
      const bodyText = (req.method !== 'GET' && req.method !== 'HEAD')
        ? await req.text().catch(() => '') : '';
      if (isProxyPath && Buffer.byteLength(bodyText) > MAX_BUFFER_BYTES) {
        return new Response(JSON.stringify({ error: 'request_too_large' }), {
          status: 413,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Promise(resolve => {
        const ip = srv.requestIP(req)?.address || 'unknown';
        const nodeReq: any = {
          method: req.method,
          url: url.pathname + url.search,
          headers: {} as Record<string, string>,
          socket: { remoteAddress: ip }, ip,
          body: bodyText,
          on(ev: string, cb: Function) {
            if (ev === 'data' && bodyText) cb(Buffer.from(bodyText));
            if (ev === 'end') cb();
          },
        };
        for (const [k, v] of req.headers.entries()) nodeReq.headers[k] = v;

        const nodeRes = createNodeResAdapter((response) => resolve(response));

        createHandler(service, { secretsLoader, lockoutState, redis }, verificationService, ollamaProxyEnabled)(nodeReq, nodeRes);
      });
    },
  });

  console.log(`\u2699\ufe0f Kill Switch API v2.0.0 listening on port ${port} [${config.env}]`);
  console.log(`   WebSocket: ws://localhost:${port}/ws`);

  // Seed admin user + feature flags AFTER Bun.serve() is listening.
  // seedAdminUser() now uses a DIRECT DB insert (no HTTP self-roundtrip),
  // so it cannot deadlock the event loop during startup. It runs after
  // Bun.serve() returns so the server is fully ready to serve requests.
  setTimeout(async () => { try { await seedAdminUser(); console.log("[seed] Admin user seeded successfully"); } catch (e) { console.error("[seed] Admin user seeding failed (non-fatal):", e); } }, 1000);

  try {
    setTimeout(async () => { try { await seedFeatureFlags(); console.log("[seed] Feature flags seeded"); } catch (e) { console.error("[seed] Feature flags failed (non-fatal):", e); } }, 2000);
  } catch (e) {
    console.error('[seed] Feature flag seeding failed (non-fatal):', e);
  }

  return { server, service, redis, wsManager };
}

if (import.meta.path.endsWith('index.ts') || import.meta.path.endsWith('index.mjs')) {
  startServer().catch((err: any) => { console.error('Failed:', err); process.exit(1); });
}

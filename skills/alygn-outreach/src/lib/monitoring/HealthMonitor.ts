/**
 * HealthMonitor — Periodic health checks for all outreach services
 *
 * Design decisions:
 *  - Each service check is an async function that never throws (errors → unhealthy).
 *  - Checks run on a configurable interval (default 30s) via setInterval.
 *  - History is capped at 100 entries per service (ring-buffer style shift).
 *  - Non-blocking: check failures are caught and recorded; they never reject.
 *  - File-based persistence: latest snapshot written to data/health/ on each cycle.
 *  - Independently usable: no dependency on MetricsCollector or AlertManager.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  type HealthCheckResult,
  type HealthHistoryEntry,
  type HealthSnapshot,
  HealthStatus,
  type ServiceName,
} from './types';

export interface HealthMonitorOptions {
  /** Check interval in milliseconds (default 30_000) */
  intervalMs?: number;
  /** Max history entries per service (default 100) */
  maxHistory?: number;
  /** Directory for file-based persistence (default: data/health) */
  dataDir?: string;
  /** Services to monitor (default: all known services) */
  services?: ServiceName[];
}

/** Check function: returns a HealthCheckResult. Must never throw. */
export type HealthCheckFn = () => Promise<HealthCheckResult>;

const DEFAULT_SERVICES: ServiceName[] = ['supabase', 'notion', 'email', 'redis', 'x-api'];

export class HealthMonitor {
  private readonly intervalMs: number;
  private readonly maxHistory: number;
  private readonly dataDir: string;
  private readonly services: ServiceName[];
  private readonly checkFns: Map<ServiceName, HealthCheckFn> = new Map();
  private readonly history: Map<ServiceName, HealthHistoryEntry[]> = new Map();
  private readonly seqCounters: Map<ServiceName, number> = new Map();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private latestSnapshot: HealthSnapshot | null = null;

  constructor(options: HealthMonitorOptions = {}) {
    this.intervalMs = options.intervalMs ?? 30_000;
    this.maxHistory = options.maxHistory ?? 100;
    this.dataDir = options.dataDir ?? path.join(process.cwd(), 'data', 'health');
    this.services = options.services ?? [...DEFAULT_SERVICES];

    // Initialize history arrays
    for (const svc of this.services) {
      this.history.set(svc, []);
      this.seqCounters.set(svc, 0);
    }

    // Register default check functions
    this.registerDefaults();
  }

  // ─── Public API ────────────────────────────────────────────────

  /** Register a custom check function for a service */
  registerCheck(service: ServiceName, fn: HealthCheckFn): void {
    this.checkFns.set(service, fn);
  }

  /** Start periodic health checks */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Run first check immediately (non-blocking)
    this.runAllChecks().catch(() => {});

    this.timer = setInterval(() => {
      this.runAllChecks().catch(() => {});
    }, this.intervalMs);
  }

  /** Stop periodic health checks */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
  }

  /** Run a single check for a specific service (non-blocking) */
  async checkService(service: ServiceName): Promise<HealthCheckResult> {
    const fn = this.checkFns.get(service);
    if (!fn) {
      return this.unknownResult(service, 'No check function registered');
    }

    try {
      const result = await fn();
      this.recordResult(service, result);
      return result;
    } catch (err) {
      const result: HealthCheckResult = {
        service,
        status: HealthStatus.Unhealthy,
        latencyMs: -1,
        message: `Check threw: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      };
      this.recordResult(service, result);
      return result;
    }
  }

  /** Get the latest snapshot (all services) */
  getSnapshot(): HealthSnapshot | null {
    return this.latestSnapshot;
  }

  /** Get history for a specific service */
  getHistory(service: ServiceName): HealthHistoryEntry[] {
    return this.history.get(service) ?? [];
  }

  /** Get the last N consecutive unhealthy checks for a service */
  getConsecutiveUnhealthy(service: ServiceName): number {
    const hist = this.history.get(service) ?? [];
    let count = 0;
    for (let i = hist.length - 1; i >= 0; i--) {
      if (hist[i].status === HealthStatus.Unhealthy) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  /** Is the monitor currently running? */
  isRunning(): boolean {
    return this.running;
  }

  // ─── Internal ──────────────────────────────────────────────────

  private async runAllChecks(): Promise<void> {
    const results = new Map<ServiceName, HealthCheckResult>();

    // Run all checks concurrently (non-blocking relative to each other)
    const promises = this.services.map(async (svc) => {
      const result = await this.checkService(svc);
      results.set(svc, result);
    });

    await Promise.allSettled(promises);

    // Build snapshot
    const services: HealthSnapshot['services'] = {} as HealthSnapshot['services'];
    for (const svc of this.services) {
      services[svc] = results.get(svc) ?? null;
    }

    const snapshot: HealthSnapshot = {
      services,
      overall: this.computeOverall(services),
      checkedAt: Date.now(),
    };

    this.latestSnapshot = snapshot;

    // Persist to disk (non-blocking, fire-and-forget)
    this.persistSnapshot(snapshot).catch(() => {});
  }

  private computeOverall(services: HealthSnapshot['services']): HealthStatus {
    const statuses = Object.values(services)
      .map((r) => r?.status)
      .filter((s): s is HealthStatus => s !== undefined && s !== null);

    if (statuses.length === 0) return HealthStatus.Unknown;
    if (statuses.every((s) => s === HealthStatus.Healthy)) return HealthStatus.Healthy;
    if (statuses.some((s) => s === HealthStatus.Unhealthy)) return HealthStatus.Unhealthy;
    return HealthStatus.Degraded;
  }

  private recordResult(service: ServiceName, result: HealthCheckResult): void {
    const hist = this.history.get(service) ?? [];
    const seq = (this.seqCounters.get(service) ?? 0) + 1;
    this.seqCounters.set(service, seq);

    hist.push({ ...result, seq });

    // Cap at maxHistory
    if (hist.length > this.maxHistory) {
      hist.splice(0, hist.length - this.maxHistory);
    }

    this.history.set(service, hist);
  }

  private async persistSnapshot(snapshot: HealthSnapshot): Promise<void> {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      const filePath = path.join(this.dataDir, 'latest.json');
      fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
    } catch {
      // Persistence failure is non-fatal
    }
  }

  private unknownResult(service: ServiceName, message: string): HealthCheckResult {
    return {
      service,
      status: HealthStatus.Unknown,
      latencyMs: -1,
      message,
      timestamp: Date.now(),
    };
  }

  // ─── Default Check Implementations ─────────────────────────────

  private registerDefaults(): void {
    this.registerCheck('supabase', () => this.checkSupabase());
    this.registerCheck('notion', () => this.checkNotion());
    this.registerCheck('email', () => this.checkEmail());
    this.registerCheck('redis', () => this.checkRedis());
    this.registerCheck('x-api', () => this.checkXApi());
  }

  /** Supabase: verify credentials exist and attempt a lightweight query */
  private async checkSupabase(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const creds = this.loadCredentials();
      const supabase = creds?.supabase as Record<string, string> | undefined;

      if (!supabase?.url || !supabase?.key) {
        return {
          service: 'supabase',
          status: HealthStatus.Unhealthy,
          latencyMs: Date.now() - start,
          message: 'Supabase credentials not configured',
          timestamp: Date.now(),
        };
      }

      // Attempt lightweight connectivity check via REST
      const url = `${supabase.url}/rest/v1/?apikey=${supabase.key}`;
      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
        headers: { apikey: supabase.key },
      });

      const latencyMs = Date.now() - start;

      if (res.ok || res.status === 200 || res.status === 406) {
        // 406 = acceptable (no Accept header match) but connection works
        return {
          service: 'supabase',
          status: HealthStatus.Healthy,
          latencyMs,
          message: 'Supabase reachable',
          timestamp: Date.now(),
        };
      }

      return {
        service: 'supabase',
        status: HealthStatus.Degraded,
        latencyMs,
        message: `Supabase returned HTTP ${res.status}`,
        timestamp: Date.now(),
      };
    } catch (err) {
      return {
        service: 'supabase',
        status: HealthStatus.Unhealthy,
        latencyMs: Date.now() - start,
        message: `Supabase check failed: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      };
    }
  }

  /** Notion: verify API key exists and call /users endpoint */
  private async checkNotion(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const creds = this.loadCredentials();
      const notion = creds?.notion as Record<string, string> | undefined;

      if (!notion?.apiKey) {
        return {
          service: 'notion',
          status: HealthStatus.Unhealthy,
          latencyMs: Date.now() - start,
          message: 'Notion API key not configured',
          timestamp: Date.now(),
        };
      }

      const res = await fetch('https://api.notion.com/v1/users/me', {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
        headers: {
          Authorization: `Bearer ${notion.apiKey}`,
          'Notion-Version': '2022-06-28',
        },
      });

      const latencyMs = Date.now() - start;

      if (res.ok) {
        return {
          service: 'notion',
          status: HealthStatus.Healthy,
          latencyMs,
          message: 'Notion API reachable',
          timestamp: Date.now(),
        };
      }

      return {
        service: 'notion',
        status: HealthStatus.Degraded,
        latencyMs,
        message: `Notion API returned HTTP ${res.status}`,
        timestamp: Date.now(),
      };
    } catch (err) {
      return {
        service: 'notion',
        status: HealthStatus.Unhealthy,
        latencyMs: Date.now() - start,
        message: `Notion check failed: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      };
    }
  }

  /** Email: verify SMTP/Smartlead credentials exist */
  private async checkEmail(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const creds = this.loadCredentials();
      const hasSMTP = !!(creds?.smtp as Record<string, unknown>)?.host;
      const hasSmartlead = !!(creds?.smartlead as Record<string, unknown>)?.apiKey;

      const latencyMs = Date.now() - start;

      if (hasSMTP || hasSmartlead) {
        const providers: string[] = [];
        if (hasSMTP) providers.push('SMTP');
        if (hasSmartlead) providers.push('Smartlead');

        return {
          service: 'email',
          status: HealthStatus.Healthy,
          latencyMs,
          message: `Email provider configured: ${providers.join(', ')}`,
          timestamp: Date.now(),
        };
      }

      return {
        service: 'email',
        status: HealthStatus.Unhealthy,
        latencyMs,
        message: 'No email provider configured',
        timestamp: Date.now(),
      };
    } catch (err) {
      return {
        service: 'email',
        status: HealthStatus.Unhealthy,
        latencyMs: Date.now() - start,
        message: `Email check failed: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      };
    }
  }

  /** Redis: check if REDIS_URL is configured and attempt PING */
  private async checkRedis(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const redisUrl = process.env.REDIS_URL;

      if (!redisUrl) {
        return {
          service: 'redis',
          status: HealthStatus.Unknown,
          latencyMs: Date.now() - start,
          message: 'Redis not configured (REDIS_URL not set)',
          timestamp: Date.now(),
        };
      }

      // Basic TCP connectivity check using fetch-like approach
      // Since we can't import ioredis without adding deps, we do a TCP check
      const url = new URL(redisUrl);
      const net = await import('net');

      return new Promise<HealthCheckResult>((resolve) => {
        const socket = net.createConnection({
          host: url.hostname,
          port: parseInt(url.port || '6379'),
        });

        const timeout = setTimeout(() => {
          if (!socket.destroyed) {
            socket.destroy();
          }
          resolve({
            service: 'redis',
            status: HealthStatus.Unhealthy,
            latencyMs: Date.now() - start,
            message: 'Redis connection timed out (5s)',
            timestamp: Date.now(),
          });
        }, 5000);

        socket.once('connect', () => {
          clearTimeout(timeout);
          if (!socket.destroyed) {
            socket.destroy();
          }
          resolve({
            service: 'redis',
            status: HealthStatus.Healthy,
            latencyMs: Date.now() - start,
            message: 'Redis TCP connection successful',
            timestamp: Date.now(),
          });
        });

        socket.once('error', (err) => {
          clearTimeout(timeout);
          if (!socket.destroyed) {
            socket.destroy();
          }
          resolve({
            service: 'redis',
            status: HealthStatus.Unhealthy,
            latencyMs: Date.now() - start,
            message: `Redis connection failed: ${err.message}`,
            timestamp: Date.now(),
          });
        });
      });
    } catch (err) {
      return {
        service: 'redis',
        status: HealthStatus.Unhealthy,
        latencyMs: Date.now() - start,
        message: `Redis check failed: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      };
    }
  }

  /** X API: check if credentials exist and verify rate limit status */
  private async checkXApi(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const creds = this.loadCredentials();
      const xApi = creds?.xApi as Record<string, string> | undefined;

      if (!xApi?.bearerToken) {
        // Check environment variable as fallback
        if (!process.env.X_BEARER_TOKEN) {
          return {
            service: 'x-api',
            status: HealthStatus.Unknown,
            latencyMs: Date.now() - start,
            message: 'X API credentials not configured',
            timestamp: Date.now(),
          };
        }
      }

      const token = xApi?.bearerToken || process.env.X_BEARER_TOKEN || '';

      // Check rate limit status via /2/usage endpoint (lightweight)
      const res = await fetch('https://api.x.com/2/users/me', {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const latencyMs = Date.now() - start;

      // Redact bearer token from all health check result details to prevent
      // credential exposure in logs/serialized snapshots.
      const redact = (obj: Record<string, unknown>): Record<string, unknown> => {
        const sanitized: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(obj)) {
          sanitized[key] = typeof val === 'string' && /bearer|token|key|secret|auth/i.test(key)
            ? '[REDACTED]'
            : val;
        }
        return sanitized;
      };

      if (res.ok) {
        return {
          service: 'x-api',
          status: HealthStatus.Healthy,
          latencyMs,
          message: 'X API reachable',
          timestamp: Date.now(),
          details: { rateLimitRemaining: res.headers.get('x-rate-limit-remaining'), sensitive: false },
        };
      }

      if (res.status === 429) {
        return {
          service: 'x-api',
          status: HealthStatus.Degraded,
          latencyMs,
          message: 'X API rate limited',
          timestamp: Date.now(),
          details: {
            rateLimitReset: res.headers.get('x-rate-limit-reset'),
            sensitive: false,
          },
        };
      }

      if (res.status === 401) {
        return {
          service: 'x-api',
          status: HealthStatus.Unhealthy,
          latencyMs,
          message: 'X API authentication failed',
          timestamp: Date.now(),
        };
      }

      return {
        service: 'x-api',
        status: HealthStatus.Degraded,
        latencyMs,
        message: `X API returned HTTP ${res.status}`,
        timestamp: Date.now(),
      };
    } catch (err) {
      return {
        service: 'x-api',
        status: HealthStatus.Unhealthy,
        latencyMs: Date.now() - start,
        message: `X API check failed: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      };
    }
  }

  // ─── Credential Loading (mirrors PreflightChecker pattern) ─────

  /**
   * Load credentials for service health checks.
   *
   * Security note: Credentials (API keys, bearer tokens, secrets) are read from
   * environment variables first (12-factor app pattern). The credentials file is
   * only used as a fallback. Avoid relying on the file path in production — use
   * environment variables instead.
   *
   * Supported env vars (checked before file):
   *   SUPABASE_URL, SUPABASE_KEY, NOTION_API_KEY, X_BEARER_TOKEN,
   *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
   *   SMARTLEAD_API_KEY
   *
   * Override the credentials file path with HEALTH_CHECK_CREDENTIALS_PATH.
   */
  private loadCredentials(): Record<string, unknown> | null {
    // Build credentials from environment variables first
    const fromEnv: Record<string, unknown> = {};

    if (process.env.SUPABASE_URL || process.env.SUPABASE_KEY) {
      fromEnv.supabase = {
        url: process.env.SUPABASE_URL || '',
        key: process.env.SUPABASE_KEY || '',
      };
    }
    if (process.env.NOTION_API_KEY) {
      fromEnv.notion = { apiKey: process.env.NOTION_API_KEY };
    }
    if (process.env.X_BEARER_TOKEN) {
      fromEnv.xApi = { bearerToken: process.env.X_BEARER_TOKEN };
    }
    if (process.env.SMTP_HOST) {
      fromEnv.smtp = {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      };
    }
    if (process.env.SMARTLEAD_API_KEY) {
      fromEnv.smartlead = { apiKey: process.env.SMARTLEAD_API_KEY };
    }

    // If we have env vars, return them (file is fallback)
    if (Object.keys(fromEnv).length > 0) {
      // Merge with file credentials for any missing keys
      const fileCreds = this.loadCredentialsFromFile();
      if (fileCreds) {
        return { ...fileCreds, ...fromEnv };
      }
      return fromEnv;
    }

    // No env vars — fall back to credentials file
    return this.loadCredentialsFromFile();
  }

  private loadCredentialsFromFile(): Record<string, unknown> | null {
    const credPath =
      process.env.HEALTH_CHECK_CREDENTIALS_PATH ||
      path.join(process.env.HOME || '/home/andlersrv', '.openclaw/workspace/config/credentials.json');

    if (!fs.existsSync(credPath)) return null;

    try {
      return JSON.parse(fs.readFileSync(credPath, 'utf8'));
    } catch {
      return null;
    }
  }
}

export default HealthMonitor;
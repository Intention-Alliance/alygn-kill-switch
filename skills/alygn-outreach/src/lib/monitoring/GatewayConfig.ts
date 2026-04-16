/**
 * GatewayConfig — Configurable remote URL for gateway connections
 *
 * Features:
 *  - Primary + fallback URL support with automatic failover
 *  - Environment variable override (GATEWAY_REMOTE_URL / GATEWAY_FALLBACK_URL)
 *  - URL format validation (must be http/https, valid hostname, no auth in URL)
 *  - Reachability check (HEAD/GET with configurable timeout)
 *  - Integration with HealthMonitor as a health-checkable service
 *  - No external dependencies — uses only Node built-ins + fetch
 */

import {
  type HealthCheckResult,
  type ServiceName,
  HealthStatus,
} from './types';
import type { HealthCheckFn } from './HealthMonitor';

// ─── Types ────────────────────────────────────────────────────────

export interface GatewayConfigOptions {
  /** Primary gateway URL (overridden by GATEWAY_REMOTE_URL env var) */
  url?: string;
  /** Fallback URL when primary is unreachable (overridden by GATEWAY_FALLBACK_URL env var) */
  fallbackUrl?: string;
  /** Reachability check timeout in ms (default: 5000) */
  reachabilityTimeoutMs?: number;
  /** How long to cache a reachability result before re-checking (default: 60_000) */
  cacheTtlMs?: number;
  /** Custom headers to send with reachability probes (e.g. Authorization) */
  probeHeaders?: Record<string, string>;
  /** HTTP method for reachability probe (default: 'HEAD') */
  probeMethod?: 'HEAD' | 'GET';
  /** Whether to start reachability checks immediately (default: false) */
  autoCheck?: boolean;
}

export interface GatewayUrlValidation {
  valid: boolean;
  errors: string[];
}

export interface GatewayReachabilityResult {
  url: string;
  reachable: boolean;
  latencyMs: number;
  status?: number;
  error?: string;
  checkedAt: number;
}

export interface GatewayActiveConfig {
  /** The currently active URL (primary or fallback) */
  activeUrl: string;
  /** Whether we're running on the fallback */
  usingFallback: boolean;
  /** Last known reachability for the active URL */
  lastReachability: GatewayReachabilityResult | null;
}

// ─── Constants ────────────────────────────────────────────────────

const ENV_PRIMARY = 'GATEWAY_REMOTE_URL';
const ENV_FALLBACK = 'GATEWAY_FALLBACK_URL';
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_CACHE_TTL_MS = 60_000;
const DEFAULT_PROBE_METHOD: 'HEAD' | 'GET' = 'HEAD';
const URL_REGEX = /^https?:\/\/[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)*(\:\d+)?(\/[^\s]*)?$/;

// ─── GatewayConfig ────────────────────────────────────────────────

export class GatewayConfig {
  private readonly primaryUrl: string;
  private readonly fallbackUrl: string | null;
  private readonly reachabilityTimeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly probeHeaders: Record<string, string>;
  private readonly probeMethod: 'HEAD' | 'GET';

  private activeUrl: string;
  private usingFallback: boolean;
  private reachabilityCache: Map<string, GatewayReachabilityResult> = new Map();

  constructor(options: GatewayConfigOptions = {}) {
    // Environment variables take precedence over constructor options
    const envPrimary = process.env[ENV_PRIMARY]?.trim();
    const envFallback = process.env[ENV_FALLBACK]?.trim();

    this.primaryUrl = envPrimary || options.url || '';
    this.fallbackUrl = envFallback || options.fallbackUrl || null;
    this.reachabilityTimeoutMs = options.reachabilityTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.probeHeaders = options.probeHeaders ?? {};
    this.probeMethod = options.probeMethod ?? DEFAULT_PROBE_METHOD;

    this.activeUrl = this.primaryUrl;
    this.usingFallback = false;

    // Validate primary URL at construction time
    const validation = this.validateUrl(this.primaryUrl);
    if (!validation.valid) {
      throw new GatewayConfigError(
        `Invalid primary gateway URL "${this.primaryUrl}": ${validation.errors.join('; ')}`
      );
    }

    // Validate fallback URL if provided
    if (this.fallbackUrl !== null) {
      const fallbackValidation = this.validateUrl(this.fallbackUrl);
      if (!fallbackValidation.valid) {
        throw new GatewayConfigError(
          `Invalid fallback gateway URL "${this.fallbackUrl}": ${fallbackValidation.errors.join('; ')}`
        );
      }
    }

    // Auto-check reachability if requested
    if (options.autoCheck) {
      this.ensureReachable().catch(() => {});
    }
  }

  // ─── Public API ────────────────────────────────────────────────

  /** Get the primary configured URL */
  getPrimaryUrl(): string {
    return this.primaryUrl;
  }

  /** Get the fallback URL (null if not configured) */
  getFallbackUrl(): string | null {
    return this.fallbackUrl;
  }

  /** Get the currently active URL */
  getActiveUrl(): string {
    return this.activeUrl;
  }

  /** Whether the active URL is the fallback */
  isUsingFallback(): boolean {
    return this.usingFallback;
  }

  /** Get full active config snapshot */
  getConfig(): GatewayActiveConfig {
    return {
      activeUrl: this.activeUrl,
      usingFallback: this.usingFallback,
      lastReachability: this.reachabilityCache.get(this.activeUrl) ?? null,
    };
  }

  /** Validate a URL string (format only, no network call) */
  validateUrl(url: string): GatewayUrlValidation {
    const errors: string[] = [];

    if (!url || url.trim().length === 0) {
      errors.push('URL must not be empty');
      return { valid: false, errors };
    }

    // Must be http or https
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      errors.push('URL must use http:// or https:// scheme');
    }

    // Basic format check
    if (!URL_REGEX.test(url.trim())) {
      errors.push('URL format is invalid (expected: http(s)://host[:port][/path])');
    }

    // Parse with URL constructor for deeper checks
    try {
      const parsed = new URL(url);

      // No credentials in URL
      if (parsed.username || parsed.password) {
        errors.push('URL must not contain credentials (username:password@)');
      }

      // Must have a hostname
      if (!parsed.hostname || parsed.hostname === '') {
        errors.push('URL must include a valid hostname');
      }

      // No whitespace
      if (/\s/.test(url)) {
        errors.push('URL must not contain whitespace');
      }
    } catch {
      errors.push('URL is not parseable');
    }

    return { valid: errors.length === 0, errors };
  }

  /** Check reachability of a specific URL (uses cache if fresh) */
  async checkReachability(url?: string): Promise<GatewayReachabilityResult> {
    const targetUrl = url ?? this.activeUrl;
    const cached = this.reachabilityCache.get(targetUrl);

    // Return cached result if still fresh
    if (cached && Date.now() - cached.checkedAt < this.cacheTtlMs) {
      return cached;
    }

    const result = await this.probeUrl(targetUrl);
    this.reachabilityCache.set(targetUrl, result);
    return result;
  }

  /**
   * Ensure the active URL is reachable. If not, attempt failover to fallback.
   * Returns the active config after attempting failover.
   */
  async ensureReachable(): Promise<GatewayActiveConfig> {
    const primaryResult = await this.checkReachability(this.primaryUrl);

    if (primaryResult.reachable) {
      this.activeUrl = this.primaryUrl;
      this.usingFallback = false;
      return this.getConfig();
    }

    // Primary unreachable — try fallback
    if (this.fallbackUrl !== null) {
      const fallbackResult = await this.checkReachability(this.fallbackUrl);

      if (fallbackResult.reachable) {
        this.activeUrl = this.fallbackUrl;
        this.usingFallback = true;
        return this.getConfig();
      }
    }

    // Neither reachable — stay on primary (will surface as unhealthy)
    this.activeUrl = this.primaryUrl;
    this.usingFallback = false;
    return this.getConfig();
  }

  /**
   * Force switch back to primary URL (e.g. after manual intervention).
   * Does NOT check reachability — call ensureReachable() after if needed.
   */
  switchToPrimary(): void {
    this.activeUrl = this.primaryUrl;
    this.usingFallback = false;
  }

  /**
   * Manually switch to fallback URL.
   * Throws if no fallback is configured.
   */
  switchToFallback(): void {
    if (this.fallbackUrl === null) {
      throw new GatewayConfigError('No fallback URL configured');
    }
    this.activeUrl = this.fallbackUrl;
    this.usingFallback = true;
  }

  /** Clear the reachability cache (forces fresh checks) */
  clearCache(): void {
    this.reachabilityCache.clear();
  }

  // ─── HealthMonitor Integration ──────────────────────────────────

  /**
   * Returns a HealthCheckFn suitable for registration with HealthMonitor.
   * Usage: healthMonitor.registerCheck('gateway' as ServiceName, gatewayConfig.asHealthCheck())
   *
   * Note: 'gateway' is not in the ServiceName union yet; cast when registering.
   * The health check will:
   *  1. Run ensureReachable() (primary → fallback failover)
   *  2. Report status based on reachability
   */
  asHealthCheck(): HealthCheckFn {
    return async (): Promise<HealthCheckResult> => {
      const start = Date.now();
      try {
        const config = await this.ensureReachable();
        const reachability = config.lastReachability;
        const latencyMs = Date.now() - start;

        if (!reachability) {
          return {
            service: 'gateway' as ServiceName,
            status: HealthStatus.Unknown,
            latencyMs,
            message: 'Gateway reachability unknown (no result)',
            timestamp: Date.now(),
          };
        }

        if (reachability.reachable) {
          const msg = config.usingFallback
            ? `Gateway reachable via fallback (${config.activeUrl})`
            : `Gateway reachable (${config.activeUrl})`;

          return {
            service: 'gateway' as ServiceName,
            status: config.usingFallback ? HealthStatus.Degraded : HealthStatus.Healthy,
            latencyMs: reachability.latencyMs,
            message: msg,
            timestamp: Date.now(),
            details: {
              activeUrl: config.activeUrl,
              usingFallback: config.usingFallback,
              primaryUrl: this.primaryUrl,
              fallbackUrl: this.fallbackUrl,
              httpStatus: reachability.status,
            },
          };
        }

        return {
          service: 'gateway' as ServiceName,
          status: HealthStatus.Unhealthy,
          latencyMs: reachability.latencyMs,
          message: `Gateway unreachable: ${reachability.error ?? `HTTP ${reachability.status}`}`,
          timestamp: Date.now(),
          details: {
            activeUrl: config.activeUrl,
            primaryUrl: this.primaryUrl,
            fallbackUrl: this.fallbackUrl,
            lastError: reachability.error,
            lastHttpStatus: reachability.status,
          },
        };
      } catch (err) {
        return {
          service: 'gateway' as ServiceName,
          status: HealthStatus.Unhealthy,
          latencyMs: Date.now() - start,
          message: `Gateway health check failed: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        };
      }
    };
  }

  // ─── Internal ──────────────────────────────────────────────────

  private async probeUrl(url: string): Promise<GatewayReachabilityResult> {
    const start = Date.now();
    try {
      const headers: Record<string, string> = {
        ...this.probeHeaders,
      };

      const res = await fetch(url, {
        method: this.probeMethod,
        signal: AbortSignal.timeout(this.reachabilityTimeoutMs),
        redirect: 'follow',
        headers,
      });

      const latencyMs = Date.now() - start;

      // Any response (even 4xx/5xx) means the host is reachable at the network level.
      // We consider 5xx as unreachable (server error), everything else as reachable.
      const reachable = res.status < 500;

      return {
        url,
        reachable,
        latencyMs,
        status: res.status,
        error: reachable ? undefined : `Server error: HTTP ${res.status}`,
        checkedAt: Date.now(),
      };
    } catch (err) {
      return {
        url,
        reachable: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
        checkedAt: Date.now(),
      };
    }
  }
}

// ─── Custom Error ─────────────────────────────────────────────────

export class GatewayConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayConfigError';
  }
}

export default GatewayConfig;
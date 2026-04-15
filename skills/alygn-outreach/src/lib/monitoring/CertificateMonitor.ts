/**
 * CertificateMonitor — SSL/TLS certificate lifecycle management
 *
 * Checks SSL certificates for external services, extracts
 * hostname/issuer/validFrom/validTo/daysUntilExpiry, and fires
 * alerts at 30 days (warning) and 7 days (critical).
 *
 * Uses Node.js tls module. No external dependencies.
 * Integrates with HealthMonitor and AlertManager.
 */
import * as tls from 'tls';
import type { AlertManager } from './AlertManager';
import type { HealthMonitor } from './HealthMonitor';
import type { HealthCheckResult } from './types';
import { HealthStatus } from './types';

// ─── Types ────────────────────────────────────────────────────────

export interface CertificateInfo {
  hostname: string;
  port: number;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  daysUntilExpiry: number;
  fingerprint: string;
  serialNumber: string;
}

export interface CertificateCheckResult {
  certificate: CertificateInfo | null;
  error: string | null;
  checkedAt: number;
}

export interface CertificateMonitorOptions {
  /** Services to monitor (hostname:port pairs) */
  services?: CertificateService[];
  /** Check interval in milliseconds (default: 6 hours = 21_600_000) */
  intervalMs?: number;
  /** Connection timeout per certificate check in ms (default: 10_000) */
  timeoutMs?: number;
  /** Warning threshold in days (default: 30) */
  warningDays?: number;
  /** Critical threshold in days (default: 7) */
  criticalDays?: number;
  /** Alert manager instance for firing alerts */
  alertManager?: AlertManager;
  /** Health monitor instance for registering health checks */
  healthMonitor?: HealthMonitor;
  /** When true (default), reject unauthorized certificates and surface cert errors */
  strictTLS?: boolean;
}

export interface CertificateService {
  /** Hostname to check (e.g., 'api.notion.com') */
  hostname: string;
  /** Port number (default: 443) */
  port?: number;
  /** Service name for health check registration */
  serviceName?: string;
}

// ─── CertificateMonitor ────────────────────────────────────────────

export class CertificateMonitor {
  private readonly services: CertificateService[];
  private readonly intervalMs: number;
  private readonly timeoutMs: number;
  private readonly warningDays: number;
  private readonly criticalDays: number;
  private readonly alertManager?: AlertManager;
  private readonly healthMonitor?: HealthMonitor;
  private readonly strictTLS: boolean;

  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly results: Map<string, CertificateCheckResult> = new Map();

  constructor(options: CertificateMonitorOptions = {}) {
    this.services = options.services ?? [];
    this.intervalMs = options.intervalMs ?? 21_600_000; // 6 hours
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.warningDays = options.warningDays ?? 30;
    this.criticalDays = options.criticalDays ?? 7;
    this.alertManager = options.alertManager;
    this.healthMonitor = options.healthMonitor;
    this.strictTLS = options.strictTLS ?? true;
  }

  // ─── Public API ────────────────────────────────────────────────

  /** Add a service to monitor */
  addService(service: CertificateService): void {
    const key = this.serviceKey(service);
    if (!this.services.some((s) => this.serviceKey(s) === key)) {
      this.services.push(service);
      // Register health check immediately if monitor is already running
      if (this.running && this.healthMonitor) {
        const serviceName = service.serviceName ?? `cert-${service.hostname}`;
        this.healthMonitor.registerCheck(serviceName as any, async (): Promise<HealthCheckResult> => {
          const result = this.results.get(key);

          if (!result) {
            return {
              service: serviceName as any,
              status: HealthStatus.Unknown,
              latencyMs: -1,
              message: 'Certificate not yet checked',
              timestamp: Date.now(),
            };
          }

          if (result.error) {
            return {
              service: serviceName as any,
              status: HealthStatus.Unhealthy,
              latencyMs: -1,
              message: `Certificate check failed: ${result.error}`,
              timestamp: result.checkedAt,
            };
          }

          const cert = result.certificate!;
          if (cert.daysUntilExpiry <= this.criticalDays) {
            return {
              service: serviceName as any,
              status: HealthStatus.Unhealthy,
              latencyMs: -1,
              message: `Certificate expires in ${cert.daysUntilExpiry} day(s) (critical: ≤${this.criticalDays} days)`,
              timestamp: result.checkedAt,
              details: {
                hostname: cert.hostname,
                issuer: cert.issuer,
                validTo: cert.validTo.toISOString(),
                daysUntilExpiry: cert.daysUntilExpiry,
              },
            };
          }

          if (cert.daysUntilExpiry <= this.warningDays) {
            return {
              service: serviceName as any,
              status: HealthStatus.Degraded,
              latencyMs: -1,
              message: `Certificate expires in ${cert.daysUntilExpiry} day(s) (warning: ≤${this.warningDays} days)`,
              timestamp: result.checkedAt,
              details: {
                hostname: cert.hostname,
                issuer: cert.issuer,
                validTo: cert.validTo.toISOString(),
                daysUntilExpiry: cert.daysUntilExpiry,
              },
            };
          }

          return {
            service: serviceName as any,
            status: HealthStatus.Healthy,
            latencyMs: -1,
            message: `Certificate valid for ${cert.daysUntilExpiry} more days. Issuer: ${cert.issuer}`,
            timestamp: result.checkedAt,
            details: {
              hostname: cert.hostname,
              issuer: cert.issuer,
              validFrom: cert.validFrom.toISOString(),
              validTo: cert.validTo.toISOString(),
              daysUntilExpiry: cert.daysUntilExpiry,
            },
          };
        });
      }
    }
  }

  /** Remove a service from monitoring */
  removeService(hostname: string, port: number = 443): void {
    const idx = this.services.findIndex(
      (s) => s.hostname === hostname && (s.port ?? 443) === port
    );
    if (idx >= 0) this.services.splice(idx, 1);
    this.results.delete(`${hostname}:${port}`);
  }

  /** Start periodic certificate checks */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Register health check functions for each service
    this.registerHealthChecks();

    // Run first check immediately
    this.runAllChecks().catch(() => {});

    this.timer = setInterval(() => {
      this.runAllChecks().catch(() => {});
    }, this.intervalMs);
  }

  /** Stop periodic checks */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
  }

  /** Check a single service's certificate */
  async checkService(service: CertificateService): Promise<CertificateCheckResult> {
    const hostname = service.hostname;
    const port = service.port ?? 443;

    try {
      const cert = await this.fetchCertificate(hostname, port);
      const info = this.extractCertificateInfo(cert, hostname, port);
      const result: CertificateCheckResult = {
        certificate: info,
        error: null,
        checkedAt: Date.now(),
      };

      this.results.set(this.serviceKey(service), result);

      // Fire alerts based on days until expiry
      this.evaluateAlerts(info);

      return result;
    } catch (err) {
      const result: CertificateCheckResult = {
        certificate: null,
        error: err instanceof Error ? err.message : String(err),
        checkedAt: Date.now(),
      };

      this.results.set(this.serviceKey(service), result);

      // Fire critical alert for connection failures
      if (this.alertManager) {
        // Remove any previous unreachable rule before adding a new one
        this.alertManager.removeRule(`cert-unreachable-${hostname}`);
        this.alertManager.addRule({
          name: `cert-unreachable-${hostname}`,
          description: `Cannot reach ${hostname}:${port} for certificate check`,
          severity: 'critical',
          evaluate: () => ({
            id: '',
            rule: `cert-unreachable-${hostname}`,
            severity: 'critical',
            message: `Cannot reach ${hostname}:${port} for certificate check: ${result.error}`,
            timestamp: Date.now(),
            details: { hostname, port, error: result.error },
            acknowledged: false,
          }),
        });
      }

      return result;
    }
  }

  /** Get the latest check result for a service */
  getResult(hostname: string, port: number = 443): CertificateCheckResult | undefined {
    return this.results.get(`${hostname}:${port}`);
  }

  /** Get all latest check results */
  getAllResults(): Map<string, CertificateCheckResult> {
    return new Map(this.results);
  }

  /** Get services expiring within N days */
  getExpiringSoon(withinDays: number): CertificateInfo[] {
    const expiring: CertificateInfo[] = [];
    for (const result of this.results.values()) {
      if (result.certificate && result.certificate.daysUntilExpiry <= withinDays) {
        expiring.push(result.certificate);
      }
    }
    return expiring;
  }

  /** Is the monitor currently running? */
  isRunning(): boolean {
    return this.running;
  }

  // ─── Internal ──────────────────────────────────────────────────

  private serviceKey(service: CertificateService): string {
    return `${service.hostname}:${service.port ?? 443}`;
  }

  /** Fetch a certificate from a remote host using TLS */
  private fetchCertificate(
    hostname: string,
    port: number
  ): Promise<tls.PeerCertificate> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const socket = tls.connect(
        {
          host: hostname,
          port,
          servername: hostname,
          rejectUnauthorized: this.strictTLS,
        },
        () => {
          if (settled) return;
          try {
            // Safety check: even with rejectUnauthorized:true, verify authorization
            if (this.strictTLS && !socket.authorized) {
              const authErr = socket.authorizationError;
              socket.destroy();
              settled = true;
              reject(
                new Error(
                  `Certificate verification failed for ${hostname}:${port}: ${authErr instanceof Error ? authErr.message : authErr || 'unauthorized'}`
                )
              );
              return;
            }

            const cert = socket.getPeerCertificate();
            socket.destroy();

            if (!cert || Object.keys(cert).length === 0) {
              settled = true;
              reject(new Error(`No certificate received from ${hostname}:${port}`));
              return;
            }

            settled = true;
            resolve(cert);
          } catch (err) {
            socket.destroy();
            if (!settled) {
              settled = true;
              reject(err);
            }
          }
        }
      );

      socket.setTimeout(this.timeoutMs, () => {
        socket.destroy();
        if (!settled) {
          settled = true;
          reject(new Error(`Connection to ${hostname}:${port} timed out after ${this.timeoutMs}ms`));
        }
      });

      socket.once('error', (err) => {
        if (!socket.destroyed) socket.destroy();
        if (!settled) {
          settled = true;
          reject(new Error(`TLS connection to ${hostname}:${port} failed: ${err.message}`));
        }
      });
    });
  }

  /** Extract structured info from a raw TLS certificate */
  private extractCertificateInfo(
    cert: tls.PeerCertificate,
    hostname: string,
    port: number
  ): CertificateInfo {
    const validFrom = new Date(cert.valid_from);
    const validTo = new Date(cert.valid_to);
    const now = Date.now();
    const daysUntilExpiry = Math.floor((validTo.getTime() - now) / (1000 * 60 * 60 * 24));

    // Extract issuer as readable string
    const issuer = this.formatDistinguishedName(cert.issuer);

    return {
      hostname,
      port,
      issuer,
      validFrom,
      validTo,
      daysUntilExpiry,
      fingerprint: cert.fingerprint ?? '',
      serialNumber: cert.serialNumber ?? '',
    };
  }

  /** Format a certificate distinguished name (issuer/subject) */
  private formatDistinguishedName(
    dn: tls.DetailedPeerCertificate['issuer'] | tls.DetailedPeerCertificate['subject']
  ): string {
    if (!dn) return 'Unknown';
    if (typeof dn === 'string') return dn;

    // dn is an object like { O: 'Let\'s Encrypt', CN: 'R3', ... }
    const parts: string[] = [];
    const fieldOrder = ['CN', 'O', 'OU', 'C', 'ST', 'L'] as const;

    for (const field of fieldOrder) {
      const value = (dn as Record<string, string>)[field];
      if (value) {
        parts.push(`${field}=${value}`);
      }
    }

    return parts.length > 0 ? parts.join(', ') : 'Unknown';
  }

  /** Evaluate and fire alerts based on days until expiry */
  private evaluateAlerts(info: CertificateInfo): void {
    if (!this.alertManager) return;

    const { hostname, port, daysUntilExpiry } = info;
    const ruleName = `cert-expiry-${hostname}:${port}`;

    // Remove any previous cert-expiry rule for this service
    this.alertManager.removeRule(ruleName);

    if (daysUntilExpiry <= this.criticalDays) {
      // Critical: expires within 7 days (or already expired)
      this.alertManager.addRule({
        name: ruleName,
        description: `Certificate for ${hostname} expires in ${daysUntilExpiry} days (critical threshold: ${this.criticalDays} days)`,
        severity: 'critical',
        evaluate: () => ({
          id: '',
          rule: ruleName,
          severity: 'critical',
          message: `Certificate for ${hostname}:${port} expires in ${daysUntilExpiry} day(s) — CRITICAL (threshold: ${this.criticalDays} days). Issued by: ${info.issuer}. Expires: ${info.validTo.toISOString()}`,
          timestamp: Date.now(),
          details: {
            hostname,
            port,
            daysUntilExpiry,
            issuer: info.issuer,
            validFrom: info.validFrom.toISOString(),
            validTo: info.validTo.toISOString(),
            fingerprint: info.fingerprint,
            threshold: 'critical',
            thresholdDays: this.criticalDays,
          },
          acknowledged: false,
        }),
      });
    } else if (daysUntilExpiry <= this.warningDays) {
      // Warning: expires within 30 days
      this.alertManager.addRule({
        name: ruleName,
        description: `Certificate for ${hostname} expires in ${daysUntilExpiry} days (warning threshold: ${this.warningDays} days)`,
        severity: 'warning',
        evaluate: () => ({
          id: '',
          rule: ruleName,
          severity: 'warning',
          message: `Certificate for ${hostname}:${port} expires in ${daysUntilExpiry} day(s) — WARNING (threshold: ${this.warningDays} days). Issued by: ${info.issuer}. Expires: ${info.validTo.toISOString()}`,
          timestamp: Date.now(),
          details: {
            hostname,
            port,
            daysUntilExpiry,
            issuer: info.issuer,
            validFrom: info.validFrom.toISOString(),
            validTo: info.validTo.toISOString(),
            fingerprint: info.fingerprint,
            threshold: 'warning',
            thresholdDays: this.warningDays,
          },
          acknowledged: false,
        }),
      });
    }
    // If daysUntilExpiry > warningDays, no alert needed — rule already removed above
  }

  /** Register health check functions for monitored services */
  private registerHealthChecks(): void {
    if (!this.healthMonitor) return;

    for (const service of this.services) {
      const serviceName = service.serviceName ?? `cert-${service.hostname}`;
      this.healthMonitor.registerCheck(serviceName as any, async (): Promise<HealthCheckResult> => {
        const key = this.serviceKey(service);
        const result = this.results.get(key);

        if (!result) {
          return {
            service: serviceName as any,
            status: HealthStatus.Unknown,
            latencyMs: -1,
            message: 'Certificate not yet checked',
            timestamp: Date.now(),
          };
        }

        if (result.error) {
          return {
            service: serviceName as any,
            status: HealthStatus.Unhealthy,
            latencyMs: -1,
            message: `Certificate check failed: ${result.error}`,
            timestamp: result.checkedAt,
          };
        }

        const cert = result.certificate!;
        if (cert.daysUntilExpiry <= this.criticalDays) {
          return {
            service: serviceName as any,
            status: HealthStatus.Unhealthy,
            latencyMs: -1,
            message: `Certificate expires in ${cert.daysUntilExpiry} day(s) (critical: ≤${this.criticalDays} days)`,
            timestamp: result.checkedAt,
            details: {
              hostname: cert.hostname,
              issuer: cert.issuer,
              validTo: cert.validTo.toISOString(),
              daysUntilExpiry: cert.daysUntilExpiry,
            },
          };
        }

        if (cert.daysUntilExpiry <= this.warningDays) {
          return {
            service: serviceName as any,
            status: HealthStatus.Degraded,
            latencyMs: -1,
            message: `Certificate expires in ${cert.daysUntilExpiry} day(s) (warning: ≤${this.warningDays} days)`,
            timestamp: result.checkedAt,
            details: {
              hostname: cert.hostname,
              issuer: cert.issuer,
              validTo: cert.validTo.toISOString(),
              daysUntilExpiry: cert.daysUntilExpiry,
            },
          };
        }

        return {
          service: serviceName as any,
          status: HealthStatus.Healthy,
          latencyMs: -1,
          message: `Certificate valid for ${cert.daysUntilExpiry} more days. Issuer: ${cert.issuer}`,
          timestamp: result.checkedAt,
          details: {
            hostname: cert.hostname,
            issuer: cert.issuer,
            validFrom: cert.validFrom.toISOString(),
            validTo: cert.validTo.toISOString(),
            daysUntilExpiry: cert.daysUntilExpiry,
          },
        };
      });
    }
  }

  /** Run certificate checks for all registered services */
  private async runAllChecks(): Promise<void> {
    const promises = this.services.map((service) =>
      this.checkService(service).catch(() => {
        // Individual check failures are recorded in results; don't fail the batch
      })
    );

    await Promise.allSettled(promises);
  }
}

export default CertificateMonitor;
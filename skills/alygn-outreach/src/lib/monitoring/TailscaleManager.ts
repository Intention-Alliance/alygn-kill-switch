/**
 * TailscaleManager — Manages Tailscale VPN connection lifecycle
 *
 * Features:
 *  - connect() / disconnect() / isConnected() / reconnect()
 *  - Auto-reconnect on unexpected disconnect with configurable backoff
 *  - Connection state tracking (connected / disconnected / reconnecting)
 *  - HealthCheck integration via HealthMonitor.registerCheck()
 *  - AuditLogger integration for all connection events
 *
 * No new dependencies — uses only Node.js built-ins (child_process, events).
 */
import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { HealthCheckFn } from './HealthMonitor';
import { HealthStatus } from './types';
import type { AuditLogger } from '../audit/AuditLogger';

// ── Types ──────────────────────────────────────────────────────────────────

export type TailscaleConnectionState = 'connected' | 'disconnected' | 'reconnecting';

export interface TailscaleManagerOptions {
  /** Max auto-reconnect attempts before giving up (default: 5) */
  maxRetries?: number;
  /** Base backoff in ms; actual delay = backoffMs * 2^attempt (default: 1000) */
  backoffMs?: number;
  /** Maximum backoff cap in ms (default: 30_000) */
  maxBackoffMs?: number;
  /** Timeout for tailscale CLI commands in ms (default: 10_000) */
  commandTimeoutMs?: number;
  /** AuditLogger instance for connection event logging */
  auditLogger?: AuditLogger;
  /** Enable auto-reconnect on unexpected disconnect (default: true) */
  autoReconnect?: boolean;
  /** Polling interval for connection status checks in ms (default: 15_000) */
  pollIntervalMs?: number;
}

interface ReconnectState {
  attempt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

// ── TailscaleManager ──────────────────────────────────────────────────────

export class TailscaleManager extends EventEmitter {
  private readonly maxRetries: number;
  private readonly backoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly commandTimeoutMs: number;
  private readonly auditLogger?: AuditLogger;
  private readonly autoReconnect: boolean;
  private readonly pollIntervalMs: number;

  private state: TailscaleConnectionState = 'disconnected';
  private reconnectState: ReconnectState = { attempt: 0, timer: null };
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private shuttingDown = false;

  constructor(opts: TailscaleManagerOptions = {}) {
    super();
    this.maxRetries = opts.maxRetries ?? 5;
    this.backoffMs = opts.backoffMs ?? 1000;
    this.maxBackoffMs = opts.maxBackoffMs ?? 30_000;
    this.commandTimeoutMs = opts.commandTimeoutMs ?? 10_000;
    this.auditLogger = opts.auditLogger;
    this.autoReconnect = opts.autoReconnect ?? true;
    this.pollIntervalMs = opts.pollIntervalMs ?? 15_000;
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Establish Tailscale VPN connection */
  async connect(): Promise<void> {
    if (this.state === 'connected') return;

    this.shuttingDown = false;

    await this.audit('tailscale.connect', 'initiate', { state: this.state });

    try {
      await this.runTailscale('up');
      this.setState('connected');
      this.resetReconnectState();
      await this.audit('tailscale.connect', 'success', {});
      this.startPolling();
    } catch (err) {
      this.setState('disconnected');
      const msg = err instanceof Error ? err.message : String(err);
      await this.audit('tailscale.connect', 'failure', { error: msg });
      throw new Error(`Tailscale connect failed: ${msg}`);
    }
  }

  /** Tear down Tailscale VPN connection */
  async disconnect(): Promise<void> {
    this.shuttingDown = true;
    this.stopPolling();
    this.cancelReconnect();

    await this.audit('tailscale.disconnect', 'initiate', { state: this.state });

    try {
      await this.runTailscale('down');
      this.setState('disconnected');
      await this.audit('tailscale.disconnect', 'success', {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.audit('tailscale.disconnect', 'error', { error: msg });
      // Still mark disconnected — best-effort teardown
      this.setState('disconnected');
    }
  }

  /** Check if Tailscale is currently connected */
  async isConnected(): Promise<boolean> {
    try {
      const status = await this.getStatus();
      return status === 'connected';
    } catch {
      return false;
    }
  }

  /** Reconnect with exponential backoff */
  async reconnect(): Promise<void> {
    this.cancelReconnect();
    this.stopPolling();

    await this.audit('tailscale.reconnect', 'initiate', { state: this.state });

    try {
      await this.runTailscale('down');
    } catch {
      // Best-effort teardown before reconnect
    }

    this.reconnectState.attempt = 0;
    await this.attemptReconnect();
  }

  /** Get current connection state */
  getState(): TailscaleConnectionState {
    return this.state;
  }

  /** Get the current reconnect attempt number (0 if not reconnecting) */
  getReconnectAttempt(): number {
    return this.reconnectState.attempt;
  }

  /**
   * Return a HealthCheckFn suitable for HealthMonitor.registerCheck().
   * Service name used: 'tailscale' (caller should add it to ServiceName if needed).
   */
  asHealthCheck(): HealthCheckFn {
    return async () => {
      const start = Date.now();
      try {
        const connected = await this.isConnected();
        const latencyMs = Date.now() - start;
        return {
          service: 'tailscale' as any,
          status: connected ? HealthStatus.Healthy : HealthStatus.Unhealthy,
          latencyMs,
          message: connected ? 'Tailscale VPN connected' : 'Tailscale VPN disconnected',
          timestamp: Date.now(),
        };
      } catch (err) {
        return {
          service: 'tailscale' as any,
          status: HealthStatus.Unhealthy,
          latencyMs: Date.now() - start,
          message: `Tailscale health check failed: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        };
      }
    };
  }

  /** Clean up all timers — call on process exit */
  destroy(): void {
    this.shuttingDown = true;
    this.stopPolling();
    this.cancelReconnect();
    this.removeAllListeners();
  }

  // ── State Management ────────────────────────────────────────────

  private setState(newState: TailscaleConnectionState): void {
    const oldState = this.state;
    if (oldState === newState) return;
    this.state = newState;
    this.emit('stateChange', { from: oldState, to: newState });
  }

  // ── Polling ────────────────────────────────────────────────────

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(async () => {
      if (this.shuttingDown) return;
      try {
        const connected = await this.isConnected();
        if (!connected && this.state === 'connected') {
          // Unexpected disconnect detected
          this.setState('disconnected');
          await this.audit('tailscale.status', 'disconnect-detected', {});
          this.emit('unexpectedDisconnect');
          if (this.autoReconnect) {
            this.startAutoReconnect();
          }
        } else if (connected && this.state !== 'connected') {
          this.setState('connected');
          this.resetReconnectState();
        }
      } catch {
        // Polling errors are non-critical
      }
    }, this.pollIntervalMs);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // ── Auto-Reconnect ─────────────────────────────────────────────

  private startAutoReconnect(): void {
    this.reconnectState.attempt = 0;
    this.setState('reconnecting');
    this.scheduleReconnectAttempt();
  }

  private scheduleReconnectAttempt(): void {
    if (this.shuttingDown) return;
    if (this.reconnectState.attempt >= this.maxRetries) {
      this.setState('disconnected');
      this.emit('reconnectFailed', { attempts: this.reconnectState.attempt });
      this.audit('tailscale.reconnect', 'exhausted', {
        attempts: this.reconnectState.attempt,
        maxRetries: this.maxRetries,
      }).catch(() => {});
      return;
    }

    const delay = Math.min(this.backoffMs * Math.pow(2, this.reconnectState.attempt), this.maxBackoffMs);
    this.reconnectState.timer = setTimeout(async () => {
      if (this.shuttingDown) return;
      await this.attemptReconnect();
    }, delay);
  }

  private async attemptReconnect(): Promise<void> {
    this.reconnectState.attempt++;
    this.setState('reconnecting');

    await this.audit('tailscale.reconnect', 'attempt', {
      attempt: this.reconnectState.attempt,
      maxRetries: this.maxRetries,
    });

    try {
      await this.runTailscale('up');
      this.setState('connected');
      this.resetReconnectState();
      await this.audit('tailscale.reconnect', 'success', { attempt: this.reconnectState.attempt });
      this.emit('reconnected', { attempt: this.reconnectState.attempt });
      this.startPolling();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.audit('tailscale.reconnect', 'failure', {
        attempt: this.reconnectState.attempt,
        error: msg,
      });
      this.scheduleReconnectAttempt();
    }
  }

  private cancelReconnect(): void {
    if (this.reconnectState.timer) {
      clearTimeout(this.reconnectState.timer);
      this.reconnectState.timer = null;
    }
  }

  private resetReconnectState(): void {
    this.cancelReconnect();
    this.reconnectState.attempt = 0;
  }

  // ── Tailscale CLI ──────────────────────────────────────────────

  private runTailscale(arg: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`tailscale ${arg} timed out after ${this.commandTimeoutMs}ms`));
      }, this.commandTimeoutMs);

      execFile('tailscale', [arg], { timeout: this.commandTimeoutMs }, (err, stdout, stderr) => {
        clearTimeout(timeout);
        if (err) {
          reject(new Error(stderr || err.message));
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  /** Parse `tailscale status` output to determine connection state */
  private async getStatus(): Promise<TailscaleConnectionState> {
    const output = await this.runTailscale('status');
    // tailscale status first line: "100.64.0.1  hostname  linux  -" when connected
    // or "Tailscale is stopped." / "stopped" when disconnected
    const lower = output.toLowerCase();
    if (lower.includes('stopped') || lower.includes('not connected') || lower.includes('offline')) {
      return 'disconnected';
    }
    // If we see an IP address (100.x.x.x), it's connected
    if (/100\.\d+\.\d+\.\d+/.test(output)) {
      return 'connected';
    }
    // Fallback: if output is non-empty and doesn't say stopped, assume connected
    if (output.length > 0 && !lower.includes('error')) {
      return 'connected';
    }
    return 'disconnected';
  }

  // ── Audit Logging ──────────────────────────────────────────────

  private async audit(action: string, target: string, details: Record<string, unknown>): Promise<void> {
    if (!this.auditLogger) return;
    try {
      await this.auditLogger.log('TailscaleManager', action, target, {
        ...details,
        connectionState: this.state,
      });
    } catch {
      // Audit failures must not crash the manager
    }
  }
}

export default TailscaleManager;
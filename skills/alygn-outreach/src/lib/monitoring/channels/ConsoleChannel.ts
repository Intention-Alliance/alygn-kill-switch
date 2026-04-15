/**
 * ConsoleChannel — Logs alerts to console + JSONL file
 *
 * Extracts the existing behavior from AlertManager's consoleChannel/fileChannel.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { AlertChannel, AlertPayload, ChannelResult } from './AlertChannel';

export interface ConsoleChannelOptions {
  /** Directory for JSONL alert files (default: data/alerts) */
  dataDir?: string;
  /** Max entries in latest.json (default: 50) */
  maxLatest?: number;
}

export class ConsoleChannel implements AlertChannel {
  readonly name = 'console';
  private readonly dataDir: string;
  private readonly maxLatest: number;

  constructor(options: ConsoleChannelOptions = {}) {
    this.dataDir = options.dataDir ?? path.join(process.cwd(), 'data', 'alerts');
    this.maxLatest = options.maxLatest ?? 50;
  }

  async send(alert: AlertPayload): Promise<ChannelResult> {
    try {
      this.logToConsole(alert);
      this.appendToFile(alert);
      return { sent: true, channel: this.name };
    } catch (err) {
      return { sent: false, channel: this.name, error: (err as Error).message };
    }
  }

  private logToConsole(alert: AlertPayload): void {
    const icon = alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️';
    const ts = new Date(alert.timestamp).toISOString();
    const logFn = alert.severity === 'critical' ? console.error : alert.severity === 'warning' ? console.warn : console.info;
    logFn(`${icon} [${ts}] ALERT [${alert.severity.toUpperCase()}] ${alert.service}: ${alert.message}`);
  }

  private appendToFile(alert: AlertPayload): void {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });

      const date = new Date(alert.timestamp).toISOString().split('T')[0];
      const filePath = path.join(this.dataDir, `alerts-${date}.jsonl`);
      fs.appendFileSync(filePath, JSON.stringify(alert) + '\n');

      const latestPath = path.join(this.dataDir, 'latest.json');
      const existing: AlertPayload[] = fs.existsSync(latestPath)
        ? JSON.parse(fs.readFileSync(latestPath, 'utf8'))
        : [];

      existing.push(alert);
      if (existing.length > this.maxLatest) {
        existing.splice(0, existing.length - this.maxLatest);
      }

      fs.writeFileSync(latestPath, JSON.stringify(existing, null, 2));
    } catch {
      // File write failure is non-fatal
    }
  }
}
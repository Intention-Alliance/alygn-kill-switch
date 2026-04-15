/**
 * MetricsCollector — Rolling-window metrics for outreach pipelines
 *
 * Design decisions:
 *  - Counters (emails sent/failed, discovery/research counts) are monotonically increasing.
 *  - Gauges (queue depth, rate limit remaining) track current values.
 *  - Histograms (pipeline execution time) track distribution stats.
 *  - Rolling window: only entries within the last 24h are retained.
 *  - Export as JSON for external dashboards.
 *  - File-based persistence to data/metrics/ on each snapshot.
 *  - Non-blocking: all operations are synchronous or fire-and-forget.
 *  - Independently usable: no dependency on HealthMonitor or AlertManager.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { MetricsSnapshot } from './types';

export interface MetricsCollectorOptions {
  /** Window duration in milliseconds (default 86_400_000 = 24h) */
  windowMs?: number;
  /** Directory for file-based persistence (default: data/metrics) */
  dataDir?: string;
  /** Persist interval in milliseconds (default 60_000) */
  persistIntervalMs?: number;
}

interface CounterEntry {
  name: string;
  value: number;
  timestamp: number;
}

interface GaugeEntry {
  name: string;
  value: number;
  timestamp: number;
}

interface HistogramEntry {
  name: string;
  value: number;
  timestamp: number;
}

export class MetricsCollector {
  private readonly windowMs: number;
  private readonly dataDir: string;
  private readonly persistIntervalMs: number;

  private counters: Map<string, CounterEntry> = new Map();
  private gauges: Map<string, GaugeEntry> = new Map();
  private histograms: Map<string, { entries: HistogramEntry[]; sum: number; min: number; max: number }> = new Map();

  private persistTimer: ReturnType<typeof setInterval> | null = null;

  // Rolling-window counters for failure rate calculation.
  // These reset on each exportSnapshot() so that brief early spikes
  // don't permanently skew the failure rate.
  private windowSent = 0;
  private windowFailed = 0;

  constructor(options: MetricsCollectorOptions = {}) {
    this.windowMs = options.windowMs ?? 86_400_000; // 24h
    this.dataDir = options.dataDir ?? path.join(process.cwd(), 'data', 'metrics');
    this.persistIntervalMs = options.persistIntervalMs ?? 60_000;
  }

  // ─── Counters ──────────────────────────────────────────────────

  /** Increment a counter (e.g., emails_sent, emails_failed) */
  incrementCounter(name: string, delta: number = 1): void {
    const now = Date.now();
    const existing = this.counters.get(name);
    if (existing) {
      existing.value += delta;
      existing.timestamp = now;
    } else {
      this.counters.set(name, { name, value: delta, timestamp: now });
    }
  }

  /** Get current counter value */
  getCounter(name: string): number {
    return this.counters.get(name)?.value ?? 0;
  }

  // ─── Gauges ───────────────────────────────────────────────────

  /** Set a gauge value (e.g., queue_depth, rate_limit_remaining) */
  setGauge(name: string, value: number): void {
    this.gauges.set(name, { name, value, timestamp: Date.now() });
  }

  /** Get current gauge value */
  getGauge(name: string): number {
    return this.gauges.get(name)?.value ?? 0;
  }

  // ─── Histograms ───────────────────────────────────────────────

  /** Record a histogram observation (e.g., pipeline_execution_time_ms) */
  observeHistogram(name: string, value: number): void {
    const now = Date.now();
    let hist = this.histograms.get(name);
    if (!hist) {
      hist = { entries: [], sum: 0, min: Infinity, max: -Infinity };
      this.histograms.set(name, hist);
    }

    hist.entries.push({ name, value, timestamp: now });
    hist.sum += value;
    if (value < hist.min) hist.min = value;
    if (value > hist.max) hist.max = value;

    // Prune entries outside the rolling window
    this.pruneHistogram(name);
  }

  /** Get histogram stats */
  getHistogramStats(name: string): { count: number; sum: number; min: number; max: number; avg: number } {
    const hist = this.histograms.get(name);
    if (!hist || hist.entries.length === 0) {
      return { count: 0, sum: 0, min: 0, max: 0, avg: 0 };
    }
    return {
      count: hist.entries.length,
      sum: hist.sum,
      min: hist.min === Infinity ? 0 : hist.min,
      max: hist.max === -Infinity ? 0 : hist.max,
      avg: hist.entries.length > 0 ? hist.sum / hist.entries.length : 0,
    };
  }

  // ─── Convenience Methods ──────────────────────────────────────

  /** Record an email sent */
  recordEmailSent(): void {
    this.incrementCounter('emails_sent');
    this.windowSent++;
  }

  /** Record an email failure */
  recordEmailFailed(): void {
    this.incrementCounter('emails_failed');
    this.windowFailed++;
  }

  /** Record a discovery count */
  recordDiscovery(count: number = 1): void {
    this.incrementCounter('discovery_count', count);
  }

  /** Record a research count */
  recordResearch(count: number = 1): void {
    this.incrementCounter('research_count', count);
  }

  /** Record pipeline execution time */
  recordPipelineTime(ms: number): void {
    this.observeHistogram('pipeline_execution_time_ms', ms);
  }

  /** Set queue depth */
  setQueueDepth(depth: number): void {
    this.setGauge('queue_depth', depth);
  }

  /** Set API rate limit remaining */
  setRateLimitRemaining(service: string, remaining: number): void {
    this.setGauge(`rate_limit_remaining_${service}`, remaining);
  }

  /** Get email failure rate (0-1) over the rolling window */
  getEmailFailureRate(): number {
    const total = this.windowSent + this.windowFailed;
    if (total === 0) return 0;
    return this.windowFailed / total;
  }

  // ─── Snapshot & Export ─────────────────────────────────────────

  /** Export current metrics as a JSON-serializable snapshot */
  exportSnapshot(): MetricsSnapshot {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Prune all histograms before export
    Array.from(this.histograms.keys()).forEach((name) => {
      this.pruneHistogram(name);
    });

    const counters: Record<string, number> = {};
    this.counters.forEach((entry, name) => {
      counters[name] = entry.value;
    });

    const gauges: Record<string, number> = {};
    this.gauges.forEach((entry, name) => {
      gauges[name] = entry.value;
    });

    const histograms: MetricsSnapshot['histograms'] = {};
    this.histograms.forEach((hist, name) => {
      const last = hist.entries.length > 0 ? hist.entries[hist.entries.length - 1].value : 0;
      histograms[name] = {
        count: hist.entries.length,
        sum: hist.sum,
        min: hist.min === Infinity ? 0 : hist.min,
        max: hist.max === -Infinity ? 0 : hist.max,
        last,
      };
    });

    // Reset rolling-window email counters so failure rate is
    // calculated over the current window, not all-time.
    this.windowSent = 0;
    this.windowFailed = 0;

    return {
      counters,
      gauges,
      histograms,
      windowStart,
      windowEnd: now,
    };
  }

  /** Export as JSON string */
  exportJSON(): string {
    return JSON.stringify(this.exportSnapshot(), null, 2);
  }

  // ─── Persistence ──────────────────────────────────────────────

  /** Start periodic persistence */
  startPersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setInterval(() => {
      this.persist().catch(() => {});
    }, this.persistIntervalMs);
  }

  /** Stop periodic persistence */
  stopPersist(): void {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }
  }

  /** Persist current snapshot to disk */
  async persist(): Promise<void> {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      const snapshot = this.exportSnapshot();
      const filePath = path.join(this.dataDir, 'latest.json');
      fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));

      // Also write a timestamped copy (keep last 24 only)
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const tsPath = path.join(this.dataDir, `metrics-${ts}.json`);
      fs.writeFileSync(tsPath, JSON.stringify(snapshot, null, 2));

      // Clean up old timestamped files (keep last 24)
      this.cleanOldFiles();
    } catch {
      // Persistence failure is non-fatal
    }
  }

  // ─── Internal ─────────────────────────────────────────────────

  private pruneHistogram(name: string): void {
    const hist = this.histograms.get(name);
    if (!hist) return;

    const cutoff = Date.now() - this.windowMs;
    let prunedSum = 0;
    let newMin = Infinity;
    let newMax = -Infinity;

    const newEntries: HistogramEntry[] = [];
    for (const entry of hist.entries) {
      if (entry.timestamp >= cutoff) {
        newEntries.push(entry);
        prunedSum += entry.value;
        if (entry.value < newMin) newMin = entry.value;
        if (entry.value > newMax) newMax = entry.value;
      }
    }

    hist.entries = newEntries;
    hist.sum = prunedSum;
    hist.min = newMin;
    hist.max = newMax;
  }

  private cleanOldFiles(): void {
    try {
      const files = fs
        .readdirSync(this.dataDir)
        .filter((f) => f.startsWith('metrics-') && f.endsWith('.json'))
        .sort()
        .reverse();

      // Keep only the 24 most recent
      const toDelete = files.slice(24);
      for (const f of toDelete) {
        fs.unlinkSync(path.join(this.dataDir, f));
      }
    } catch {
      // Cleanup failure is non-fatal
    }
  }
}

export default MetricsCollector;
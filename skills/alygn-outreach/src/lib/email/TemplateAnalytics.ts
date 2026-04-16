/**
 * TemplateAnalytics — F-084
 * Performance analytics for template rendering, caching, and usage.
 *
 * Features:
 *   Render time tracking: avg, p50, p95, p99
 *   Cache hit/miss rate tracking
 *   Template usage frequency
 *   Error rate tracking
 *   Time-range filtered reports
 *   Integration via onRender / onCacheHit / onCacheMiss callbacks
 *
 * TypeScript strict mode. No external dependencies.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single render event recorded by the analytics system. */
export interface RenderEvent {
  /** Template name or identifier. */
  templateName: string;
  /** Render duration in milliseconds. */
  durationMs: number;
  /** Whether the render resulted in an error. */
  error: boolean;
  /** Epoch timestamp of the render. */
  timestamp: number;
}

/** A single cache event (hit or miss). */
export interface CacheEvent {
  /** Template name or cache key context. */
  templateName: string;
  /** Whether this was a cache hit. */
  hit: boolean;
  /** Epoch timestamp of the event. */
  timestamp: number;
}

/** Configuration options for TemplateAnalytics. */
export interface TemplateAnalyticsOptions {
  /** Maximum number of render events to retain (ring buffer). Default: 10000. */
  maxRenderEvents?: number;
  /** Maximum number of cache events to retain (ring buffer). Default: 10000. */
  maxCacheEvents?: number;
  /** Whether analytics are enabled. Default: true. */
  enabled?: boolean;
}

/** Percentile metrics for render times. */
export interface RenderTimeMetrics {
  /** Average render time in ms. */
  avgRenderTime: number;
  /** 50th percentile render time in ms. */
  p50: number;
  /** 95th percentile render time in ms. */
  p95: number;
  /** 99th percentile render time in ms. */
  p99: number;
  /** Minimum render time in ms. */
  min: number;
  /** Maximum render time in ms. */
  max: number;
  /** Number of render samples in the range. */
  sampleCount: number;
}

/** Cache performance metrics. */
export interface CacheMetrics {
  /** Total cache hits in the range. */
  hits: number;
  /** Total cache misses in the range. */
  misses: number;
  /** Cache hit rate (0–1). Returns 0 if no events. */
  cacheHitRate: number;
  /** Total lookups (hits + misses). */
  totalLookups: number;
}

/** Per-template usage entry. */
export interface TemplateUsageEntry {
  /** Template name. */
  templateName: string;
  /** Number of renders in the range. */
  renderCount: number;
  /** Number of errors in the range. */
  errorCount: number;
  /** Error rate (0–1). Returns 0 if no renders. */
  errorRate: number;
  /** Average render time in ms for this template. */
  avgRenderTime: number;
}

/** Error metrics. */
export interface ErrorMetrics {
  /** Total errors in the range. */
  totalErrors: number;
  /** Total renders in the range. */
  totalRenders: number;
  /** Error rate (0–1). Returns 0 if no renders. */
  errorRate: number;
  /** Errors broken down by template. */
  byTemplate: TemplateUsageEntry[];
}

/** Full analytics report for a time range. */
export interface AnalyticsReport {
  /** Start of the time range (epoch ms). */
  from: number;
  /** End of the time range (epoch ms). */
  to: number;
  /** Render time percentile metrics. */
  renderTimes: RenderTimeMetrics;
  /** Cache performance metrics. */
  cache: CacheMetrics;
  /** Templates ranked by usage (descending). */
  templatesByUsage: TemplateUsageEntry[];
  /** Error metrics. */
  errors: ErrorMetrics;
  /** Report generation timestamp (epoch ms). */
  generatedAt: number;
}

/** Time range filter for reports. */
export interface TimeRange {
  /** Start timestamp (epoch ms). Inclusive. */
  from: number;
  /** End timestamp (epoch ms). Inclusive. Default: now. */
  to?: number;
}

// ---------------------------------------------------------------------------
// Internal ring buffer
// ---------------------------------------------------------------------------

/**
 * Fixed-size ring buffer. Pushes overwrite the oldest entry when full.
 * O(1) push, O(n) iteration for filtering.
 */
class RingBuffer<T> {
  private readonly buf: Array<T | undefined>;
  private head = 0; // next write position
  private count = 0;

  constructor(private readonly capacity: number) {
    this.buf = new Array<T | undefined>(capacity);
  }

  push(item: T): void {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /** Iterate all items (oldest first). */
  *[Symbol.iterator](): Iterator<T> {
    if (this.count === 0) return;
    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % this.capacity;
      const val = this.buf[idx];
      if (val !== undefined) yield val;
    }
  }

  /** Return items matching a predicate. */
  filter(predicate: (item: T) => boolean): T[] {
    const result: T[] = [];
    for (const item of this) {
      if (predicate(item)) result.push(item);
    }
    return result;
  }

  get size(): number {
    return this.count;
  }

  clear(): void {
    this.buf.fill(undefined);
    this.head = 0;
    this.count = 0;
  }
}

// ---------------------------------------------------------------------------
// Percentile helper
// ---------------------------------------------------------------------------

/**
 * Compute a percentile from a sorted numeric array.
 * Uses nearest-rank method.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(rank, sorted.length - 1))];
}

// ---------------------------------------------------------------------------
// TemplateAnalytics class
// ---------------------------------------------------------------------------

export class TemplateAnalytics {
  private readonly maxRenderEvents: number;
  private readonly maxCacheEvents: number;
  private enabled: boolean;

  private readonly renderEvents: RingBuffer<RenderEvent>;
  private readonly cacheEvents: RingBuffer<CacheEvent>;

  constructor(options?: TemplateAnalyticsOptions) {
    this.maxRenderEvents = options?.maxRenderEvents ?? 10_000;
    this.maxCacheEvents = options?.maxCacheEvents ?? 10_000;
    this.enabled = options?.enabled ?? true;

    this.renderEvents = new RingBuffer<RenderEvent>(this.maxRenderEvents);
    this.cacheEvents = new RingBuffer<CacheEvent>(this.maxCacheEvents);
  }

  // -----------------------------------------------------------------------
  // Recording methods (called by TemplateEngine / TemplateCache)
  // -----------------------------------------------------------------------

  /**
   * Record a render event. Called via TemplateEngine's onRender callback.
   */
  recordRender(templateName: string, durationMs: number, error: boolean = false): void {
    if (!this.enabled) return;
    this.renderEvents.push({
      templateName,
      durationMs,
      error,
      timestamp: Date.now(),
    });
  }

  /**
   * Record a cache hit. Called via TemplateCache's onHit callback.
   */
  recordCacheHit(templateName: string): void {
    if (!this.enabled) return;
    this.cacheEvents.push({
      templateName,
      hit: true,
      timestamp: Date.now(),
    });
  }

  /**
   * Record a cache miss. Called via TemplateCache's onMiss callback.
   */
  recordCacheMiss(templateName: string): void {
    if (!this.enabled) return;
    this.cacheEvents.push({
      templateName,
      hit: false,
      timestamp: Date.now(),
    });
  }

  // -----------------------------------------------------------------------
  // Callback factories (for easy integration)
  // -----------------------------------------------------------------------

  /**
   * Create an onRender callback for TemplateEngine integration.
   *
   * @example
   * ```ts
   * const analytics = new TemplateAnalytics();
   * // In TemplateEngine.render(), after timing:
   * const start = performance.now();
   * const result = engine.render(template, data);
   * analytics.onRenderCallback()(templateName, performance.now() - start);
   * ```
   */
  onRenderCallback(): (templateName: string, durationMs: number, error?: boolean) => void {
    return (templateName, durationMs, error) => {
      this.recordRender(templateName, durationMs, error);
    };
  }

  /**
   * Create an onCacheHit callback for TemplateCache integration.
   */
  onCacheHitCallback(): (templateName: string) => void {
    return (templateName) => {
      this.recordCacheHit(templateName);
    };
  }

  /**
   * Create an onCacheMiss callback for TemplateCache integration.
   */
  onCacheMissCallback(): (templateName: string) => void {
    return (templateName) => {
      this.recordCacheMiss(templateName);
    };
  }

  // -----------------------------------------------------------------------
  // Metrics computation
  // -----------------------------------------------------------------------

  /**
   * Compute render time metrics for a time range.
   */
  getRenderTimeMetrics(range?: TimeRange): RenderTimeMetrics {
    const from = range?.from ?? 0;
    const to = range?.to ?? Date.now();

    const events = this.renderEvents.filter(
      (e) => e.timestamp >= from && e.timestamp <= to && !e.error,
    );

    if (events.length === 0) {
      return {
        avgRenderTime: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        min: 0,
        max: 0,
        sampleCount: 0,
      };
    }

    const durations = events.map((e) => e.durationMs).sort((a, b) => a - b);
    const sum = durations.reduce((a, b) => a + b, 0);

    return {
      avgRenderTime: sum / durations.length,
      p50: percentile(durations, 50),
      p95: percentile(durations, 95),
      p99: percentile(durations, 99),
      min: durations[0],
      max: durations[durations.length - 1],
      sampleCount: durations.length,
    };
  }

  /**
   * Compute cache metrics for a time range.
   */
  getCacheMetrics(range?: TimeRange): CacheMetrics {
    const from = range?.from ?? 0;
    const to = range?.to ?? Date.now();

    const events = this.cacheEvents.filter(
      (e) => e.timestamp >= from && e.timestamp <= to,
    );

    const hits = events.filter((e) => e.hit).length;
    const misses = events.length - hits;
    const total = events.length;

    return {
      hits,
      misses,
      cacheHitRate: total === 0 ? 0 : hits / total,
      totalLookups: total,
    };
  }

  /**
   * Get templates ranked by usage (descending render count) for a time range.
   */
  getTemplatesByUsage(range?: TimeRange): TemplateUsageEntry[] {
    const from = range?.from ?? 0;
    const to = range?.to ?? Date.now();

    const events = this.renderEvents.filter(
      (e) => e.timestamp >= from && e.timestamp <= to,
    );

    // Aggregate by template name
    const map = new Map<string, { renders: number; errors: number; totalMs: number }>();
    for (const e of events) {
      let entry = map.get(e.templateName);
      if (!entry) {
        entry = { renders: 0, errors: 0, totalMs: 0 };
        map.set(e.templateName, entry);
      }
      entry.renders++;
      if (e.error) entry.errors++;
      entry.totalMs += e.durationMs;
    }

    // Build and sort
    const result: TemplateUsageEntry[] = [];
    for (const [templateName, data] of map) {
      result.push({
        templateName,
        renderCount: data.renders,
        errorCount: data.errors,
        errorRate: data.renders === 0 ? 0 : data.errors / data.renders,
        avgRenderTime: data.renders === 0 ? 0 : data.totalMs / data.renders,
      });
    }

    result.sort((a, b) => b.renderCount - a.renderCount);
    return result;
  }

  /**
   * Compute error metrics for a time range.
   */
  getErrorMetrics(range?: TimeRange): ErrorMetrics {
    const from = range?.from ?? 0;
    const to = range?.to ?? Date.now();

    const events = this.renderEvents.filter(
      (e) => e.timestamp >= from && e.timestamp <= to,
    );

    const totalRenders = events.length;
    const totalErrors = events.filter((e) => e.error).length;

    // Build by-template breakdown for errored templates
    const errorMap = new Map<string, { renders: number; errors: number; totalMs: number }>();
    for (const e of events) {
      let entry = errorMap.get(e.templateName);
      if (!entry) {
        entry = { renders: 0, errors: 0, totalMs: 0 };
        errorMap.set(e.templateName, entry);
      }
      entry.renders++;
      if (e.error) entry.errors++;
      entry.totalMs += e.durationMs;
    }

    const byTemplate: TemplateUsageEntry[] = [];
    for (const [templateName, data] of errorMap) {
      // Only include templates that have errors
      if (data.errors > 0) {
        byTemplate.push({
          templateName,
          renderCount: data.renders,
          errorCount: data.errors,
          errorRate: data.renders === 0 ? 0 : data.errors / data.renders,
          avgRenderTime: data.renders === 0 ? 0 : data.totalMs / data.renders,
        });
      }
    }
    byTemplate.sort((a, b) => b.errorCount - a.errorCount);

    return {
      totalErrors,
      totalRenders,
      errorRate: totalRenders === 0 ? 0 : totalErrors / totalRenders,
      byTemplate,
    };
  }

  /**
   * Generate a full analytics report for a time range.
   */
  generateReport(range?: TimeRange): AnalyticsReport {
    const from = range?.from ?? 0;
    const to = range?.to ?? Date.now();

    return {
      from,
      to,
      renderTimes: this.getRenderTimeMetrics(range),
      cache: this.getCacheMetrics(range),
      templatesByUsage: this.getTemplatesByUsage(range),
      errors: this.getErrorMetrics(range),
      generatedAt: Date.now(),
    };
  }

  // -----------------------------------------------------------------------
  // Utility
  // -----------------------------------------------------------------------

  /**
   * Check if analytics recording is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enable or disable analytics recording.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Clear all recorded events.
   */
  reset(): void {
    this.renderEvents.clear();
    this.cacheEvents.clear();
  }

  /**
   * Get the number of recorded render events.
   */
  getRenderEventCount(): number {
    return this.renderEvents.size;
  }

  /**
   * Get the number of recorded cache events.
   */
  getCacheEventCount(): number {
    return this.cacheEvents.size;
  }
}

export default TemplateAnalytics;
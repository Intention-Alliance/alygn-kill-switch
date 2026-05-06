// Metrics service — centralized request/response tracking
// Collects response times, error rates, connection counts for Prometheus export

interface ResponseTimeEntry {
  duration: number;
  timestamp: number;
}

class MetricsCollector {
  private requestCount = 0;
  private errorCount = 0;
  private activeConnections = 0;
  private responseTimes: ResponseTimeEntry[] = [];
  private readonly maxResponseTimeEntries = 10_000;
  private startTime = Date.now();

  incrementRequest(): void {
    this.requestCount++;
  }

  incrementError(): void {
    this.errorCount++;
  }

  incrementActiveConnections(): void {
    this.activeConnections++;
  }

  decrementActiveConnections(): void {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
  }

  recordResponseTime(durationMs: number, isError: boolean): void {
    this.requestCount++;
    if (isError) this.errorCount++;

    this.responseTimes.push({ duration: durationMs, timestamp: Date.now() });
    if (this.responseTimes.length > this.maxResponseTimeEntries) {
      this.responseTimes = this.responseTimes.slice(-this.maxResponseTimeEntries);
    }
  }

  getMetrics() {
    const durations = this.responseTimes.map((e) => e.duration).sort((a, b) => a - b);
    const count = durations.length;

    const percentile = (p: number): number => {
      if (count === 0) return 0;
      const idx = Math.ceil((p / 100) * count) - 1;
      return Math.round(durations[Math.max(0, Math.min(idx, count - 1))] * 100) / 100;
    };

    const avg = count > 0
      ? Math.round((durations.reduce((a, b) => a + b, 0) / count) * 100) / 100
      : 0;

    const errorRate = this.requestCount > 0
      ? Math.round((this.errorCount / this.requestCount) * 10000) / 10000
      : 0;

    return {
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      activeConnections: this.activeConnections,
      responseTimeP50: percentile(50),
      responseTimeP90: percentile(90),
      responseTimeP99: percentile(99),
      responseTimeAvg: avg,
      errorRate,
      uptimeSeconds: Math.round((Date.now() - this.startTime) / 1000),
    };
  }

  reset(): void {
    this.requestCount = 0;
    this.errorCount = 0;
    this.activeConnections = 0;
    this.responseTimes = [];
    this.startTime = Date.now();
  }
}

// Singleton instance
const collector = new MetricsCollector();

export function getMetrics() {
  return collector.getMetrics();
}

export function recordRequest(durationMs: number, isError: boolean): void {
  collector.recordResponseTime(durationMs, isError);
}

export function incrementActiveConnections(): void {
  collector.incrementActiveConnections();
}

export function decrementActiveConnections(): void {
  collector.decrementActiveConnections();
}

export function resetMetrics(): void {
  collector.reset();
}
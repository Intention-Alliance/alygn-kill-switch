// Cloud Cost Tracker — Track Redis ops, API requests, compute time
// Provides cost estimates and projections for cloud resource optimization

export interface CostReport {
  period: string;
  redis: {
    reads: number;
    writes: number;
    pubSub: number;
    totalOps: number;
    estimatedCostUsd: number;
  };
  api: {
    totalRequests: number;
    requestsByEndpoint: Record<string, number>;
    estimatedCostUsd: number;
  };
  compute: {
    uptimeSeconds: number;
    estimatedCostUsd: number;
  };
  totalEstimatedCostUsd: number;
  projection: {
    dailyCostUsd: number;
    monthlyCostUsd: number;
  };
  timestamp: string;
}

// Cost rates (configurable, based on typical cloud pricing)
const REDIS_READ_COST_PER_1000 = parseFloat(process.env.COST_REDIS_READ_PER_1K || '0.0001');
const REDIS_WRITE_COST_PER_1000 = parseFloat(process.env.COST_REDIS_WRITE_PER_1K || '0.0002');
const REDIS_PUBSUB_COST_PER_1000 = parseFloat(process.env.COST_REDIS_PUBSUB_PER_1K || '0.00015');
const API_REQUEST_COST_PER_1000 = parseFloat(process.env.COST_API_REQUEST_PER_1K || '0.00005');
const COMPUTE_COST_PER_HOUR = parseFloat(process.env.COST_COMPUTE_PER_HOUR || '0.032');

class CostTracker {
  private redisReads = 0;
  private redisWrites = 0;
  private redisPubSub = 0;
  private apiRequests: Record<string, number> = {};
  private startTime = Date.now();
  private lastReportTime = Date.now();

  recordRedisRead(): void {
    this.redisReads++;
  }

  recordRedisWrite(): void {
    this.redisWrites++;
  }

  recordRedisPubSub(): void {
    this.redisPubSub++;
  }

  recordApiRequest(endpoint: string): void {
    this.apiRequests[endpoint] = (this.apiRequests[endpoint] || 0) + 1;
  }

  getReport(): CostReport {
    const now = Date.now();
    const uptimeSeconds = Math.round((now - this.startTime) / 1000);
    const periodSeconds = Math.round((now - this.lastReportTime) / 1000);

    const totalRedisOps = this.redisReads + this.redisWrites + this.redisPubSub;
    const redisCost = (
      (this.redisReads / 1000) * REDIS_READ_COST_PER_1000 +
      (this.redisWrites / 1000) * REDIS_WRITE_COST_PER_1000 +
      (this.redisPubSub / 1000) * REDIS_PUBSUB_COST_PER_1000
    );

    const totalApiRequests = Object.values(this.apiRequests).reduce((a, b) => a + b, 0);
    const apiCost = (totalApiRequests / 1000) * API_REQUEST_COST_PER_1000;

    const computeCost = (uptimeSeconds / 3600) * COMPUTE_COST_PER_HOUR;

    const totalCost = redisCost + apiCost + computeCost;

    // Project based on current rate
    const hoursElapsed = Math.max(uptimeSeconds / 3600, 0.001);
    const dailyCost = (totalCost / hoursElapsed) * 24;
    const monthlyCost = dailyCost * 30;

    return {
      period: `last ${periodSeconds}s (total: ${uptimeSeconds}s)`,
      redis: {
        reads: this.redisReads,
        writes: this.redisWrites,
        pubSub: this.redisPubSub,
        totalOps: totalRedisOps,
        estimatedCostUsd: Math.round(redisCost * 10000) / 10000,
      },
      api: {
        totalRequests: totalApiRequests,
        requestsByEndpoint: { ...this.apiRequests },
        estimatedCostUsd: Math.round(apiCost * 10000) / 10000,
      },
      compute: {
        uptimeSeconds,
        estimatedCostUsd: Math.round(computeCost * 10000) / 10000,
      },
      totalEstimatedCostUsd: Math.round(totalCost * 10000) / 10000,
      projection: {
        dailyCostUsd: Math.round(dailyCost * 100) / 100,
        monthlyCostUsd: Math.round(monthlyCost * 100) / 100,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Check if an endpoint should be rate-limited based on cost.
   * Expensive endpoints (high Redis write count) get throttled more aggressively.
   */
  shouldThrottle(endpoint: string): boolean {
    const expensiveEndpoints: Record<string, number> = {
      '/v1/kill-switch/chaos': 50,   // max 50 req/hour
      '/v1/auth/login': 100,         // max 100 req/hour
    };

    const limit = expensiveEndpoints[endpoint];
    if (!limit) return false;

    const currentCount = this.apiRequests[endpoint] || 0;
    const hoursElapsed = Math.max((Date.now() - this.startTime) / 3600000, 0.001);
    const rate = currentCount / hoursElapsed;

    return rate > limit;
  }

  reset(): void {
    this.redisReads = 0;
    this.redisWrites = 0;
    this.redisPubSub = 0;
    this.apiRequests = {};
    this.startTime = Date.now();
    this.lastReportTime = Date.now();
  }
}

// Singleton
const tracker = new CostTracker();

export function getCostTracker(): CostTracker {
  return tracker;
}

export function getCostReport(): CostReport {
  return tracker.getReport();
}

export function recordRedisRead(): void {
  tracker.recordRedisRead();
}

export function recordRedisWrite(): void {
  tracker.recordRedisWrite();
}

export function recordRedisPubSub(): void {
  tracker.recordRedisPubSub();
}

export function recordApiRequest(endpoint: string): void {
  tracker.recordApiRequest(endpoint);
}

export function shouldThrottleEndpoint(endpoint: string): boolean {
  return tracker.shouldThrottle(endpoint);
}
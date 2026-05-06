// Resource Check Middleware — Reject/defer requests under resource pressure
// Protects the service from cascading failures when system resources are exhausted

import { isMemoryCritical, isMemoryWarning, getResourceStats, checkResourceAlerts } from '../services/resource-monitor';

/**
 * Resource check middleware.
 * - Rejects requests with 503 if memory > critical threshold (90%)
 * - Adds warning headers if memory > warning threshold (80%)
 * - Adds resource stats to response headers for observability
 */
export function resourceCheckMiddleware(req: any, res: any, next?: () => void): boolean {
  const stats = getResourceStats();
  const alerts = checkResourceAlerts(stats);

  // Add resource headers for observability
  res.setHeader('X-Resource-Memory-Percent', String(stats.memory.usagePercent));
  res.setHeader('X-Resource-CPU-Percent', String(stats.cpu.usagePercent));

  // Reject if memory is critical
  if (isMemoryCritical()) {
    res.writeHead(503, {
      'Content-Type': 'application/json',
      'Retry-After': '30',
      'X-Resource-Pressure': 'critical',
    });
    res.end(JSON.stringify({
      error: 'Service unavailable — memory pressure',
      memoryUsage: stats.memory.usagePercent,
      retryAfter: 30,
    }));
    return true; // Request was handled (rejected)
  }

  // Add warning header if memory is elevated
  if (isMemoryWarning()) {
    res.setHeader('X-Resource-Pressure', 'warning');
    console.warn(`[resource-check] Memory warning: ${stats.memory.usagePercent}%`);
  }

  // Log any critical alerts
  for (const alert of alerts) {
    if (alert.level === 'critical') {
      console.error(`[resource-check] ALERT: ${alert.message}`);
    } else if (alert.level === 'warning') {
      console.warn(`[resource-check] ${alert.message}`);
    }
  }

  return false; // Request not handled — continue processing
}
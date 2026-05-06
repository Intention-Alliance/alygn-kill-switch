// Admin routes — /admin/cost, /admin/runbooks, /admin/incidents
// Requires authentication (handled by main handler)

import type { KillSwitchService } from '../services/kill-switch';
import { getCostReport } from '../services/cost-tracker';
import { getResourceStats, checkResourceAlerts } from '../services/resource-monitor';
import { getIncidentResponseService, isCircuitBreakerOpen } from '../services/incident-response';
import { getMetrics } from '../services/metrics';
import { getConfig } from '../config';

export async function handleAdminRoutes(
  method: string,
  url: string,
  req: any,
  res: any,
  service: KillSwitchService,
): Promise<boolean> {
  // GET /admin/cost — Cost tracking report
  if (method === 'GET' && url === '/admin/cost') {
    const report = getCostReport();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(report));
    return true;
  }

  // GET /admin/resources — Resource monitoring stats
  if (method === 'GET' && url === '/admin/resources') {
    const stats = getResourceStats();
    const alerts = checkResourceAlerts(stats);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ stats, alerts }));
    return true;
  }

  // GET /admin/incidents — Active and recent incidents
  if (method === 'GET' && url === '/admin/incidents') {
    const incidentService = getIncidentResponseService();
    const active = incidentService.getActiveIncidents();
    const recent = incidentService.getAllIncidents(20);
    const blockedIps = incidentService.getBlockedIps();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      activeIncidents: active,
      recentIncidents: recent,
      blockedIps,
      circuitBreakerOpen: isCircuitBreakerOpen(),
    }));
    return true;
  }

  // GET /admin/runbooks — View runbook status and links
  if (method === 'GET' && url === '/admin/runbooks') {
    const config = getConfig();
    const incidentService = getIncidentResponseService();
    const activeIncidents = incidentService.getActiveIncidents();
    const metrics = getMetrics();
    const resources = getResourceStats();

    // Determine which runbooks are relevant based on current state
    const runbooks = [
      {
        id: 'redis-failure',
        title: 'Redis Failure Recovery',
        path: '/runbooks/redis-failure.md',
        active: isCircuitBreakerOpen(),
        severity: isCircuitBreakerOpen() ? 'critical' : 'none' as string,
        steps: [
          '1. Check Redis cluster status: docker compose ps redis',
          '2. Verify network connectivity: docker network inspect phase0-network',
          '3. Check Redis logs: docker compose logs redis --tail=100',
          '4. Restart Redis if needed: docker compose restart redis',
          '5. Verify recovery: curl http://localhost:3000/ready',
          '6. Circuit breaker will auto-clear when Redis recovers',
        ],
      },
      {
        id: 'high-load',
        title: 'High Load Scaling Procedures',
        path: '/runbooks/high-load.md',
        active: resources.cpu.usagePercent > 70,
        severity: resources.cpu.usagePercent > 90 ? 'critical' : resources.cpu.usagePercent > 70 ? 'warning' : 'none',
        steps: [
          '1. Check current metrics: curl http://localhost:3000/metrics',
          '2. Review resource usage: curl http://localhost:3000/admin/resources',
          '3. Scale horizontally: docker compose up --scale kill-switch-api=3',
          '4. Increase Redis pool size in config if needed',
          '5. Monitor error rate after scaling',
          '6. Consider enabling cost-aware rate limiting',
        ],
      },
      {
        id: 'security-incident',
        title: 'Security Incident Lockdown',
        path: '/runbooks/security-incident.md',
        active: activeIncidents.some((i) => i.type === 'auth_attack'),
        severity: activeIncidents.some((i) => i.type === 'auth_attack') ? 'high' : 'none',
        steps: [
          '1. Review blocked IPs: curl http://localhost:3000/admin/incidents',
          '2. Check auth failure logs for patterns',
          '3. Tighten IP allowlist if needed: update IP_ALLOWLIST env var',
          '4. Reduce auth rate limits: decrease AUTH_RATE_LIMIT_MAX',
          '5. Consider enabling LOCKED state: POST /v1/kill-switch/chaos {state: "LOCKED"}',
          '6. Review audit log for unauthorized access attempts',
        ],
      },
    ];

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      runbooks,
      currentStatus: {
        circuitBreakerOpen: isCircuitBreakerOpen(),
        memoryPressure: resources.memory.usagePercent,
        cpuUsage: resources.cpu.usagePercent,
        errorRate: metrics.errorRate,
        activeIncidents: activeIncidents.length,
      },
    }));
    return true;
  }

  // POST /admin/incidents/check — Trigger manual incident detection
  if (method === 'POST' && url === '/admin/incidents/check') {
    const incidentService = getIncidentResponseService();
    const newIncidents = await incidentService.runDetection(service);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      checked: true,
      newIncidents,
      totalActive: incidentService.getActiveIncidents().length,
    }));
    return true;
  }

  return false;
}
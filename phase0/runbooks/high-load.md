# High Load Scaling Procedures Runbook

## Detection
- CPU usage exceeds 70% (warning) or 90% (critical)
- `/admin/resources` shows elevated CPU/memory
- Incident logged with type `high_load`

## Symptoms
- Slow response times on `/metrics`
- Memory usage > 80%
- Error rate increasing

## Scaling Steps

### 1. Assess Current State
```bash
# Check metrics
curl http://localhost:3000/metrics

# Check resource usage
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/admin/resources

# Check cost impact
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/admin/cost
```

### 2. Scale Horizontally
```bash
# Scale API instances
docker compose up --scale kill-switch-api=3 -d

# Verify new instances are healthy
for i in 1 2 3; do
  curl -s http://localhost:3000/health && echo " - instance $i OK"
done
```

### 3. Increase Redis Pool Size
If Redis is the bottleneck:
```bash
# Edit .env to increase pool size
# REDIS_POOL_SIZE=20  (from default 10)

# Restart to apply
docker compose restart kill-switch-api
```

### 4. Adjust Rate Limits
If traffic is legitimate but heavy:
- Increase `RATE_LIMIT_MAX` in rate-limiter config
- Or adjust via environment: `RATE_LIMIT_MAX=30`

### 5. Enable Cost-Aware Throttling
The cost tracker automatically throttles expensive endpoints:
- `/v1/kill-switch/chaos` limited to 50 req/hour
- `/v1/auth/login` limited to 100 req/hour

### 6. Monitor After Scaling
```bash
# Watch metrics for 5 minutes
watch -n 30 'curl -s http://localhost:3000/metrics | tail -5'
```

## Vertical Scaling (if needed)
- Increase container memory: `deploy.resources.limits.memory`
- Increase CPU: `deploy.resources.limits.cpus`

## Prevention
- Set Prometheus alerts on `kill_switch_response_time_ms{quantile="0.9"}`
- Monitor `kill_switch_active_connections`
- Pre-scale before known traffic events
# Redis Failure Recovery Runbook

## Detection
- Circuit breaker activates automatically when Redis health check fails
- `/ready` endpoint returns 503
- Incident logged with type `redis_failure`

## Symptoms
- `/ready` returns 503 (not ready)
- `/v1/kill-switch/health` shows `redis: "ERROR"`
- Circuit breaker is open (`/admin/incidents` shows `circuitBreakerOpen: true`)
- All Redis-dependent operations fail fast

## Recovery Steps

### 1. Check Redis Cluster Status
```bash
docker compose ps redis
docker compose logs redis --tail=100
```

### 2. Verify Network Connectivity
```bash
docker network inspect phase0-network
# Check if kill-switch-api can reach redis:
docker compose exec kill-switch-api ping redis
```

### 3. Check Redis Directly
```bash
docker compose exec redis redis-cli ping
# Expected: PONG
docker compose exec redis redis-cli info server
```

### 4. Restart Redis (if needed)
```bash
docker compose restart redis
# Wait 10-15 seconds for startup
sleep 15
```

### 5. Verify Recovery
```bash
curl http://localhost:3000/ready
# Expected: {"status":"ready",...}
```

### 6. Confirm Circuit Breaker Cleared
```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/admin/incidents
# circuitBreakerOpen should be false
```

## Automatic Recovery
The circuit breaker auto-clears when Redis health check returns OK.
No manual intervention needed for the circuit breaker itself.

## Prevention
- Monitor `/metrics` for `kill_switch_errors_total` spikes
- Set up alerts on `/ready` returning 503
- Consider Redis Sentinel for automatic failover in production
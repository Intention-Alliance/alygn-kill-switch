# Security Incident Lockdown Procedures Runbook

## Detection
- Auth failures exceed threshold (10 per 5 min per IP)
- IP automatically blocked for 1 hour
- Incident logged with type `auth_attack`

## Symptoms
- `/admin/incidents` shows blocked IPs
- Elevated 401 responses in metrics
- Auth rate limiter triggering frequently

## Lockdown Steps

### 1. Assess the Threat
```bash
# Check blocked IPs and incidents
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/admin/incidents

# Review metrics for auth failure patterns
curl http://localhost:3000/metrics | grep -i error
```

### 2. Tighten IP Allowlist
If attack is from specific ranges:
```bash
# Restrict IP_ALLOWLIST to known safe IPs
export IP_ALLOWLIST="100.66.199.80,127.0.0.1"
# Restart to apply
docker compose restart kill-switch-api
```

### 3. Reduce Auth Rate Limits
```bash
# Stricter auth limits
export AUTH_RATE_LIMIT_MAX=3  # (from default 5)
export AUTH_RATE_LIMIT_WINDOW_MS=900000  # 15 min
```

### 4. Activate LOCKED State (Emergency)
If the attack is severe, lock the kill switch:
```bash
curl -X POST http://localhost:3000/v1/kill-switch/chaos \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"state": "LOCKED", "reason": "Security incident - brute force attack detected"}'
```

### 5. Review Audit Log
```bash
# Check recent transitions
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/v1/kill-switch/activations?limit=20
```

### 6. Unblock IPs (After Threat Passes)
Blocked IPs auto-expire after 1 hour. For manual unblock:
- Restart the service (clears in-memory block list)
- Or wait for automatic expiry

## Automatic Responses
The system automatically:
1. Blocks IPs after 10 auth failures in 5 minutes
2. Blocks for 1 hour (configurable via `INCIDENT_IP_BLOCK_DURATION_MS`)
3. Logs incident with full details

## Prevention
- Use strong auth tokens (`openssl rand -hex 32`)
- Enable `Secure` cookie flag in production
- Monitor `/admin/incidents` regularly
- Consider adding CAPTCHA for repeated failures

## Post-Incident
1. Review blocked IPs and patterns
2. Update IP allowlist if needed
3. Document the incident timeline
4. Consider permanent IP bans for persistent attackers
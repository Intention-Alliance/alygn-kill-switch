# Phase 0 - Port Configuration

## ✅ Corrected Port Mappings (2026-04-14)

### Production Ports

| Service | Port | Type | Access |
|---------|------|------|--------|
| **Admin UI** | 8443 | SSL | Public (authenticated) |
| **Ollama Proxy** | 11435 | SSL | IP allowlist only |
| **Kill Switch API** | 3000 | HTTP | Internal only (localhost) |
| **Redis Node 1** | 6379 | TCP | Internal + localhost |
| **Redis Node 2** | 6380 | TCP | Internal + localhost |
| **Redis Node 3** | 6381 | TCP | Internal + localhost |
| **Redis Exporter** | 9121 | HTTP | Internal + localhost |
| **Jaeger UI** | 16686 | HTTP | Internal + localhost |
| **OTel Collector** | 4317/4318 | gRPC/HTTP | Internal only |

---

## 🔧 Architecture Flow

```
User Browser
    ↓ HTTPS (8443)
Admin UI (nginx + Vite app)
    ↓ Proxy /api/ → localhost:3000
Kill Switch API (Docker container)
    ↓ Redis connections
Redis Cluster (6379-6381)
```

```
User Browser
    ↓ HTTPS (11435)
Ollama Proxy (nginx upstream)
    ↓ Proxy to cluster
Ollama Cluster (192.168.1.117:11434)
```

---

## ⚠️ Critical: No Port Conflicts

**Kill Switch API:**
- ✅ Internal port: 3000
- ✅ Accessed via: `http://localhost:3000` or nginx proxy
- ❌ NOT exposed on 11435 (that's Ollama's port!)

**Ollama Proxy:**
- ✅ Exposed on: 11435 (SSL)
- ✅ IP allowlist enforced
- ❌ NOT used by Kill Switch API

**Admin UI:**
- ✅ Exposed on: 8443 (SSL)
- ✅ Proxies `/api/` to `localhost:3000`
- ✅ No conflicts

---

## 🐳 Docker Compose Configuration

### Kill Switch API (CORRECT)
```yaml
kill-switch-api:
  expose:
    - "3000"        # Internal only
  ports:
    - "3000:3000"   # For local testing (can remove in production)
```

### NOT THIS (WRONG)
```yaml
kill-switch-api:
  ports:
    - "11435:3000"  # ❌ CONFLICTS with Ollama!
```

---

## 🔍 Verification Commands

```bash
# Test Kill Switch API (internal)
curl http://localhost:3000/v1/kill-switch/health

# Test Admin UI (public)
curl -k https://andlersrv.tail62d797.ts.net:8443/

# Test Ollama Proxy (IP allowlist)
curl -k https://andlersrv.tail62d797.ts.net:11435/

# Check for port conflicts
ss -tlnp | grep -E "3000|8443|11435"
```

---

## 🚀 Deployment

```bash
cd /home/andlersrv/.openclaw/workspace/phase0
bash DEPLOY-DOCKER-FIXED.sh
```

This will:
1. Stop all conflicting containers
2. Remove orphaned networks
3. Build and deploy with correct ports
4. Verify all services are healthy

---

## 📋 Nginx Proxy Configuration

Admin UI (port 8443) proxies to Kill Switch API:

```nginx
location /api/ {
    set $auth_token $http_authorization;
    # ... auth logic ...
    
    proxy_pass http://127.0.0.1:3000/v1/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

Ollama Proxy (port 11435) proxies to Ollama cluster:

```nginx
location / {
    proxy_pass http://ollama_cluster;
    # ... Ollama-specific headers ...
}
```

---

**Last Updated:** 2026-04-14 00:59 CST  
**Status:** ✅ Corrected - No conflicts

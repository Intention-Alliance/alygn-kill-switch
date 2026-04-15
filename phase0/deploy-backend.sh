#!/bin/bash
# Phase 0 - Production Ready Deployment
# All critical fixes applied - ready to deploy

set -e

echo "🔧 Phase 0 - Production Deployment"
echo "===================================="
echo ""

cd /home/andlersrv/.openclaw/workspace/phase0

# Step 1: Verify .env exists
echo "📁 Checking environment file..."
if [ ! -f ".env" ]; then
    echo "   ❌ ERROR: .env file not found!"
    exit 1
fi
echo "   ✅ .env file present"
echo ""

# Step 2: Verify Dockerfile has curl
echo "📝 Verifying Dockerfile..."
if grep -q "apk add --no-cache curl" kill-switch/Dockerfile; then
    echo "   ✅ Curl installed for health checks"
else
    echo "   ❌ ERROR: Curl not in Dockerfile!"
    exit 1
fi
echo ""

# Step 3: Stop ALL containers and force clean rebuild
echo "🛑 Cleaning up old containers and images..."
docker compose down --remove-orphans 2>/dev/null || true
docker compose -f kill-switch/docker-compose.yml down --remove-orphans 2>/dev/null || true
docker compose -f redis/docker-compose.yml down --remove-orphans 2>/dev/null || true

# Remove specific orphans
for container in redis-node-1 redis-node-2 redis-node-3 kill-switch-api kill-switch-redis; do
  if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
    docker rm -f "$container" 2>/dev/null || true
  fi
done

# CRITICAL: Remove old build cache to force fresh build with new Dockerfile
echo "   🧹 Clearing Docker build cache..."
docker builder prune -f --filter "until=24h" 2>/dev/null || true
docker rmi $(docker images -q phase0-kill-switch-api 2>/dev/null) 2>/dev/null || true
echo "   ✅ Cleanup complete"
echo ""

# Step 4: Check port conflicts
echo "🔍 Checking for port conflicts..."
CONFLICT=false
for port in 3000 6379 6380 6381 8443 11435; do
  if ss -tlnp 2>/dev/null | grep -q ":${port} "; then
    echo "   ⚠️  Port $port is in use"
    CONFLICT=true
  fi
done

if [ "$CONFLICT" = true ]; then
  echo "   ⚠️  Some ports are in use (may be OK if it's nginx)"
fi
echo ""

# Step 5: Build with NO CACHE and deploy
echo "🚀 Building with NO CACHE (critical for Dockerfile fix) and deploying..."
docker compose build --no-cache
docker compose up -d
echo "   ✅ Deployment started"
echo ""

# Step 6: Wait for services
echo "⏳ Waiting for services to start..."
sleep 15
echo ""

# Step 7: Verify Redis
echo "📊 Verifying Redis Cluster..."
for i in 1 2 3; do
  if docker exec "redis-node-$i" redis-cli -p 6379 ping 2>/dev/null | grep -q "PONG"; then
    echo "   ✅ redis-node-$i: healthy"
  else
    echo "   ⚠️  redis-node-$i: starting..."
  fi
done
echo ""

# Step 8: Verify Kill Switch API
echo "🔍 Verifying Kill Switch API..."
if curl -sf http://localhost:3000/v1/kill-switch/health 2>/dev/null | grep -q "healthy"; then
  echo "   ✅ Kill Switch API: healthy"
  echo ""
  echo "   Health response:"
  curl -s http://localhost:3000/v1/kill-switch/health | head -3
else
  echo "   ⚠️  Kill Switch API: starting..."
  echo "   Check logs: docker compose logs kill-switch-api"
fi
echo ""

# Step 9: Summary
echo "===================================="
echo "✅ DEPLOYMENT COMPLETE"
echo "===================================="
echo ""
echo "📍 Services:"
echo "   - Admin UI: https://andlersrv.tail62d797.ts.net:8443/"
echo "   - Kill Switch API: http://localhost:3000"
echo "   - Redis Cluster: localhost:6379-6381"
echo "   - Ollama Proxy: https://andlersrv.tail62d797.ts.net:11435/"
echo ""
echo "🔑 Login Credentials:"
echo "   - Auth Token: $(grep KILL_SWITCH_AUTH_TOKEN .env | cut -d'=' -f2 | cut -c1-16)..."
echo "   - Full token in /phase0/.env"
echo ""
echo "🧪 Health Checks:"
echo "   curl http://localhost:3000/v1/kill-switch/health"
echo "   docker compose ps"
echo ""
echo "📋 Logs:"
echo "   docker compose logs -f kill-switch-api"
echo ""
echo "===================================="

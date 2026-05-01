#!/bin/bash
# Phase 0 Complete Deployment Script
# Deploys: Redis Cluster + Kill Switch API + Admin UI

set -e

echo "🚀 Phase 0 Deployment"
echo "===================="
echo ""

# 1. Deploy Redis Cluster
# echo "📦 Step 1: Deploying Redis Cluster..."
# cd /home/andlersrv/.openclaw/workspace/phase0/infra/redis
#     docker compose build --no-cache
# docker compose up -d
# echo "✅ Redis Cluster deployed (3 nodes on ports 6379, 6380, 6381)"
# echo ""

# # 2. Deploy Kill Switch API
# echo "🔧 Step 2: Building Kill Switch API..."
# cd /home/andlersrv/.openclaw/workspace/phase0/apps/kill-switch-api

# # Check if .env exists
# if [ ! -f .env ]; then
#     echo "⚠️  Creating .env file with placeholder tokens..."
#     cat > .env << EOF
# KILL_SWITCH_AUTH_TOKEN=your-secure-token-here
# KILL_SWITCH_API_KEY=your-api-key-here
# EOF
#     echo "❗ EDIT .env with real tokens before starting the service!"
#     echo ""
# fi

# echo "Building Docker image..."
# docker compose build --no-cache
# docker compose up -d
# echo "✅ Kill Switch API deployed"
# echo ""

# 3. Deploy Admin UI
echo "🎨 Step 3: Deploying Admin UI..."

# Building the admin UI
cd /home/andlersrv/.openclaw/workspace/phase0/apps/admin-ui
echo "Installing dependencies..."
bun install
echo "Building admin UI..."
bun run build
echo "✅ Admin UI built successfully"
# Copy build files
echo "Copying build artifacts..."
sudo mkdir -p /var/www/admin-ui
sudo cp -r /home/andlersrv/.openclaw/workspace/phase0/apps/admin-ui/dist/* /var/www/admin-ui/
sudo chown -R www-data:www-data /var/www/admin-ui 2>/dev/null || true

# Install nginx config
echo "Installing nginx configuration..."
sudo cp /home/andlersrv/.openclaw/workspace/phase0/apps/admin-ui/nginx/admin-ui.conf /etc/nginx/sites-available/admin-ui.conf
sudo ln -sf /etc/nginx/sites-available/admin-ui.conf /etc/nginx/sites-enabled/admin-ui.conf

# Test and reload nginx
echo "Testing nginx configuration..."
sudo nginx -t

echo "Reloading nginx..."
sudo systemctl reload nginx

echo "✅ Admin UI deployed"
echo ""

# 4. Summary
echo "==================================="
echo "✅ Phase 0 Deployment Complete!"
echo "==================================="
echo ""
echo "📍 Access URL: https://andlersrv.tail62d797.ts.net:8443/admin/"
echo "🔒 IP Allowlist: 100.66.199.80, 192.168.1.11, 127.0.0.1"
echo "🔑 Auth Token: Check /home/andlersrv/.openclaw/workspace/phase0/kill-switch/.env"
echo ""
echo "📋 Services Running:"
echo "   - Redis Cluster: 3 nodes (6379, 6380, 6381)"
echo "   - Kill Switch API: Port 8443 (backend)"
echo "   - Admin UI: Port 8443/admin/ (frontend)"
echo ""
echo "🧪 Test Commands:"
echo "   # Check Redis cluster"
echo "   docker ps | grep redis"
echo ""
echo "   # Check Kill Switch API health"
echo "   curl -k https://andlersrv.tail62d797.ts.net:8443/v1/kill-switch/health"
echo ""
echo "   # Check Admin UI"
echo "   curl -k https://andlersrv.tail62d797.ts.net:8443/admin/"
echo ""
echo "⚠️  If you get 400 errors:"
echo "   1. Check nginx config: sudo nginx -t"
echo "   2. Remove Ollama proxy from /etc/nginx/nginx.conf (port 8443 conflict)"
echo "   3. Reload nginx: sudo systemctl reload nginx"
echo ""

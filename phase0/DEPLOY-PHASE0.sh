#!/bin/bash
# Phase 0 Complete Deployment Script
# Deploys: Redis Cluster + Kill Switch API + Admin UI

set -e

echo "🚀 Phase 0 Deployment"
echo "===================="
echo ""

# 1. Deploy Redis Cluster
echo "📦 Step 1: Deploying Redis Cluster..."
cd /home/andlersrv/.openclaw/workspace/phase0/redis
docker-compose up -d
echo "✅ Redis Cluster deployed (3 nodes on ports 6379, 6380, 6381)"
echo ""

# 2. Deploy Kill Switch API
echo "🔧 Step 2: Building Kill Switch API..."
cd /home/andlersrv/.openclaw/workspace/phase0/kill-switch

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  Creating .env file with placeholder tokens..."
    cat > .env << EOF
KILL_SWITCH_AUTH_TOKEN=your-secure-token-here
KILL_SWITCH_API_KEY=your-api-key-here
EOF
    echo "❗ EDIT .env with real tokens before starting the service!"
    echo ""
fi

echo "Building Docker image..."
docker-compose up -d --build
echo "✅ Kill Switch API deployed"
echo ""

# 3. Deploy Admin UI
echo "🎨 Step 3: Deploying Admin UI..."

# Copy build files
echo "Copying build artifacts..."
sudo mkdir -p /var/www/admin-ui
sudo cp -r /home/andlersrv/.openclaw/workspace/phase0/admin-ui/dist/* /var/www/admin-ui/
sudo chown -R www-data:www-data /var/www/admin-ui 2>/dev/null || true

# Install nginx config
echo "Installing nginx configuration..."
sudo cp /home/andlersrv/.openclaw/workspace/phase0/admin-ui/nginx/admin-ui.conf /etc/nginx/sites-available/admin-ui.conf

# Check if we need to disable the Ollama proxy
if grep -q "listen.*11435" /etc/nginx/nginx.conf; then
    echo ""
    echo "⚠️  WARNING: Port 11435 is currently used by Ollama proxy in /etc/nginx/nginx.conf"
    echo ""
    echo "You need to comment out or remove that server block before the admin UI can use port 11435."
    echo ""
    echo "Quick fix:"
    echo "  sudo nano /etc/nginx/nginx.conf"
    echo "  # Comment out lines 54-96 (the server { listen 11435 ssl; ... } block)"
    echo ""
    read -p "Continue anyway? (The admin UI won't work until you fix the port conflict) (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Deployment paused. Fix the port conflict and run: sudo systemctl reload nginx"
        exit 1
    fi
fi

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
echo "📍 Access URL: https://andlersrv.tail62d797.ts.net:11435/admin/"
echo "🔒 IP Allowlist: 100.66.199.80, 192.168.1.11, 127.0.0.1"
echo "🔑 Auth Token: Check /home/andlersrv/.openclaw/workspace/phase0/kill-switch/.env"
echo ""
echo "📋 Services Running:"
echo "   - Redis Cluster: 3 nodes (6379, 6380, 6381)"
echo "   - Kill Switch API: Port 11435 (backend)"
echo "   - Admin UI: Port 11435/admin/ (frontend)"
echo ""
echo "🧪 Test Commands:"
echo "   # Check Redis cluster"
echo "   docker ps | grep redis"
echo ""
echo "   # Check Kill Switch API health"
echo "   curl -k https://andlersrv.tail62d797.ts.net:11435/v1/kill-switch/health"
echo ""
echo "   # Check Admin UI"
echo "   curl -k https://andlersrv.tail62d797.ts.net:11435/admin/"
echo ""
echo "⚠️  If you get 400 errors:"
echo "   1. Check nginx config: sudo nginx -t"
echo "   2. Remove Ollama proxy from /etc/nginx/nginx.conf (port 11435 conflict)"
echo "   3. Reload nginx: sudo systemctl reload nginx"
echo ""

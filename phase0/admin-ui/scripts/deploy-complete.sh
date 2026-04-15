#!/bin/bash
# Phase 0 Admin UI - Complete Deployment Script
# Run this to deploy the Admin UI on port 8443

set -e

echo "🔧 Phase 0 Admin UI Deployment"
echo "================================"
echo ""

# Step 1: Backup current nginx config
echo "📦 Step 1: Backing up current nginx config..."
sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup.$(date +%Y%m%d-%H%M%S)
echo "   ✅ Backup created"
echo ""

# Step 2: Deploy new nginx config
echo "📝 Step 2: Deploying new nginx configuration..."
sudo cp /home/andlersrv/.openclaw/workspace/phase0/admin-ui/nginx/admin-ui-complete.conf /etc/nginx/nginx.conf
echo "   ✅ Config deployed"
echo ""

# Step 3: Fix SSL key permissions
echo "🔐 Step 3: Fixing SSL key permissions..."
if getent group http > /dev/null 2>&1; then
    sudo chown root:http /etc/ssl/private/andlersrv.tail62d797.ts.net.key
    sudo chmod 640 /etc/ssl/private/andlersrv.tail62d797.ts.net.key
    echo "   ✅ Permissions set for 'http' group"
else
    echo "   ⚠️  'http' group not found..."
fi
echo ""

# Step 4: Verify file structure
echo "📁 Step 4: Verifying file structure..."
if [ -f /var/www/admin/index.html ]; then
    echo "   ✅ Admin UI index.html exists"
else
    echo "   ❌ Admin UI index.html NOT FOUND"
    exit 1
fi

if [ -d /var/www/admin/assets ]; then
    echo "   ✅ Admin UI assets directory exists"
    ASSET_COUNT=$(ls -1 /var/www/admin/assets/*.js 2>/dev/null | wc -l)
    echo "   ✅ Found $ASSET_COUNT JavaScript assets"
else
    echo "   ❌ Admin UI assets directory NOT FOUND"
    exit 1
fi
echo ""

# Step 5: Test nginx configuration
echo "🧪 Step 5: Testing nginx configuration..."
if sudo nginx -t 2>&1 | grep -q "syntax is ok"; then
    echo "   ✅ Nginx config syntax OK"
else
    echo "   ❌ Nginx config test FAILED"
    sudo nginx -t 2>&1
    exit 1
fi
echo ""

# Step 6: Reload nginx
echo "🔄 Step 6: Reloading nginx..."
sudo systemctl reload nginx || sudo systemctl restart nginx
sleep 2
echo "   ✅ Nginx reloaded"
echo ""

# Step 7: Verify services
echo "🔍 Step 7: Verifying services..."

# Check nginx is running
if pgrep -x "nginx" > /dev/null; then
    echo "   ✅ Nginx is running"
else
    echo "   ❌ Nginx is NOT running"
    exit 1
fi

# Check Kill Switch API
if curl -s http://localhost:3000/v1/kill-switch/health | grep -q "healthy"; then
    echo "   ✅ Kill Switch API is healthy"
else
    echo "   ⚠️  Kill Switch API may not be running"
fi
echo ""

# Step 8: Test endpoints
echo "🧪 Step 8: Testing endpoints..."

# Test Admin UI
if curl -k -s -o /dev/null -w "%{http_code}" https://localhost:8443/ | grep -q "200"; then
    echo "   ✅ Admin UI (port 8443) responding with 200 OK"
else
    echo "   ⚠️  Admin UI (port 8443) not responding correctly"
fi

# Test Ollama proxy still works
if curl -k -s -o /dev/null -w "%{http_code}" https://localhost:11435/ | grep -q "200"; then
    echo "   ✅ Ollama proxy (port 11435) still working"
else
    echo "   ⚠️  Ollama proxy (port 11435) may have issues"
fi
echo ""

# Step 9: Summary
echo "================================"
echo "✅ DEPLOYMENT COMPLETE"
echo "================================"
echo ""
echo "📍 Access URLs:"
echo "   - Admin UI: https://andlersrv.tail62d797.ts.net:8443/"
echo "   - Ollama Proxy: https://andlersrv.tail62d797.ts.net:11435/"
echo ""
echo "🔑 Login Credentials:"
echo "   - Check /home/andlersrv/.openclaw/workspace/phase0/kill-switch/.env"
echo "   - Use KILL_SWITCH_AUTH_TOKEN for login"
echo ""
echo "📊 Health Checks:"
echo "   - curl -k https://localhost:8443/"
echo "   - curl -k https://localhost:11435/"
echo "   - curl http://localhost:3000/v1/kill-switch/health"
echo ""
echo "================================"

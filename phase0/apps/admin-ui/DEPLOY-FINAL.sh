#!/bin/bash
# FINAL DEPLOYMENT - Fixed Asset Routing
# This fixes the MIME type issue

set -e

echo "🔧 Final Admin UI Deployment - Fixed Assets"
echo "============================================"
echo ""

# Step 1: Backup
echo "📦 Backing up current config..."
sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup.final.$(date +%Y%m%d-%H%M%S)
echo "   ✅ Backup created"
echo ""

# Step 2: Deploy fixed config
echo "📝 Deploying fixed nginx config..."
sudo cp /home/andlersrv/.openclaw/workspace/phase0/admin-ui/nginx-final-working.conf /etc/nginx/nginx.conf
echo "   ✅ Config deployed"
echo ""

# Step 3: Fix SSL permissions
echo "🔐 Fixing SSL permissions..."
if getent group http > /dev/null 2>&1; then
    sudo chown root:http /etc/ssl/private/andlersrv.tail62d797.ts.net.key
    sudo chmod 640 /etc/ssl/private/andlersrv.tail62d797.ts.net.key
    echo "   ✅ Permissions set for 'http' group"
else
    sudo chmod 644 /etc/ssl/private/andlersrv.tail62d797.ts.net.key
    echo "   ✅ Permissions set (world-readable)"
fi
echo ""

# Step 4: Test config
echo "🧪 Testing nginx configuration..."
if sudo nginx -t 2>&1 | grep -q "syntax is ok"; then
    echo "   ✅ Nginx config OK"
else
    echo "   ❌ Config test failed:"
    sudo nginx -t 2>&1
    exit 1
fi
echo ""

# Step 5: Reload nginx
echo "🔄 Reloading nginx..."
sudo systemctl reload nginx || sudo systemctl restart nginx
sleep 2
echo "   ✅ Nginx reloaded"
echo ""

# Step 6: Test assets
echo "🧪 Testing asset delivery..."
CSS_RESPONSE=$(curl -k -s -o /dev/null -w "%{http_code}" https://localhost:8443/admin/assets/index-CqjlklYC.css)
JS_RESPONSE=$(curl -k -s -o /dev/null -w "%{http_code}" https://localhost:8443/admin/assets/index-B23enFCi.js)

if [ "$CSS_RESPONSE" = "200" ]; then
    echo "   ✅ CSS files returning 200"
else
    echo "   ⚠️  CSS returning: $CSS_RESPONSE"
fi

if [ "$JS_RESPONSE" = "200" ]; then
    echo "   ✅ JS files returning 200"
else
    echo "   ⚠️  JS returning: $JS_RESPONSE"
fi
echo ""

# Step 7: Check MIME types
echo "📋 Checking MIME types..."
CSS_TYPE=$(curl -k -s -I https://localhost:8443/admin/assets/index-CqjlklYC.css 2>/dev/null | grep -i "content-type" | head -1)
JS_TYPE=$(curl -k -s -I https://localhost:8443/admin/assets/index-B23enFCi.js 2>/dev/null | grep -i "content-type" | head -1)

echo "   CSS: $CSS_TYPE"
echo "   JS:  $JS_TYPE"
echo ""

# Step 8: Summary
echo "============================================"
echo "✅ DEPLOYMENT COMPLETE"
echo "============================================"
echo ""
echo "📍 Access: https://andlersrv.tail62d797.ts.net:8443/"
echo ""
echo "🧪 Quick Tests:"
echo "   curl -k https://localhost:8443/"
echo "   curl -k https://localhost:8443/admin/assets/index-CqjlklYC.css"
echo ""
echo "============================================"

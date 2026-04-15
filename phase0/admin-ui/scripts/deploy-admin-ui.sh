#!/bin/bash
# Admin UI Deployment Script
# This script deploys the Kill Switch Admin UI to nginx

set -e

echo "🚀 Deploying Admin UI..."

# 1. Copy built files to nginx web root
echo "📦 Copying build artifacts..."
sudo mkdir -p /var/www/admin
sudo cp -r /home/andlersrv/.openclaw/workspace/phase0/admin-ui/dist/* /var/www/admin/
sudo chown -R nginx:nginx /var/www/admin 2>/dev/null || sudo chown -R www-data:www-data /var/www/admin 2>/dev/null || true

# 2. Test nginx config
echo "🧪 Testing nginx configuration..."
sudo nginx -t

# 3. Reload nginx
echo "🔄 Reloading nginx..."
sudo systemctl reload nginx

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📍 Access URL: https://andlersrv.tail62d797.ts.net:8443/"
echo "🔒 IP Allowlist: 100.66.199.80, 192.168.1.11, 127.0.0.1"
echo "🔑 Auth: Token-based (httpOnly cookie)"
echo ""
echo "📋 Next Steps:"
echo "   1. Start the Kill Switch API backend:"
echo "      cd /home/andlersrv/.openclaw/workspace/phase0/kill-switch"
echo "      KILL_SWITCH_AUTH_TOKEN=your-token KILL_SWITCH_API_KEY=your-api-key node kill-switch-service.mjs"
echo ""
echo "   2. Test the connection:"
echo "      curl -k https://andlersrv.tail62d797.ts.net:8443/"
echo ""
echo "   3. Login with your auth token"

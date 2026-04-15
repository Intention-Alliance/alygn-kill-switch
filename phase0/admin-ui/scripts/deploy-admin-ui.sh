#!/bin/bash
# Admin UI Deployment Script
# This script builds and deploys the Kill Switch Admin UI to nginx

set -e

echo "🚀 Building and Deploying Admin UI..."
echo ""

# 0. Navigate to Admin UI directory
cd /home/andlersrv/.openclaw/workspace/phase0/admin-ui

# 1. Clean previous build
echo "🧹 Cleaning previous build..."
rm -rf dist/
mkdir -p dist/

# 2. Install dependencies
echo "📦 Installing dependencies..."
bun install

# 3. Build for production
echo "🔨 Building for production..."
bun run build

echo ""
echo "✅ Build complete! Checking output..."
ls -la dist/

# 4. Copy built files to nginx web root
echo ""
echo "📦 Copying build artifacts to nginx..."
sudo mkdir -p /var/www/admin
sudo cp -r dist/* /var/www/admin/
sudo chown -R nginx:nginx /var/www/admin 2>/dev/null || sudo chown -R www-data:www-data /var/www/admin 2>/dev/null || true

# 5. Test nginx config
echo "🧪 Testing nginx configuration..."
sudo nginx -t

# 6. Reload nginx
echo "🔄 Reloading nginx..."
sudo systemctl reload nginx

echo ""
echo "===================================="
echo "✅ DEPLOYMENT COMPLETE"
echo "===================================="
echo ""
echo "📍 Access URL: https://andlersrv.tail62d797.ts.net:8443/"
echo "🔒 IP Allowlist: 100.66.199.80, 192.168.1.11, 127.0.0.1"
echo ""
echo "🔑 Login Credentials:"
echo "   Email: admin@alyygn.com"
echo "   Password: andlersrv-auth-token-2026"
echo ""
echo "🧪 Test the connection:"
echo "   curl -k https://andlersrv.tail62d797.ts.net:8443/"
echo ""
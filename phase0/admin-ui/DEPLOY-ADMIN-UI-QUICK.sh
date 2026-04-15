#!/bin/bash
# Quick Admin UI Deploy - No Sudo Version
# Run these commands manually with sudo when prompted

set -e

echo "======================================"
echo "🚀 Admin UI Build & Deploy Commands"
echo "======================================"
echo ""
echo "Build completed successfully! ✅"
echo ""
echo "Now run these commands to deploy:"
echo ""
echo "1️⃣  Copy files to nginx:"
echo "   sudo cp -r /home/andlersrv/.openclaw/workspace/phase0/admin-ui/dist/* /var/www/admin/"
echo ""
echo "2️⃣  Fix permissions:"
echo "   sudo chown -R nginx:nginx /var/www/admin"
echo ""
echo "3️⃣  Test nginx config:"
echo "   sudo nginx -t"
echo ""
echo "4️⃣  Reload nginx:"
echo "   sudo systemctl reload nginx"
echo ""
echo "======================================"
echo "📍 After deploy:"
echo "   URL: https://andlersrv.tail62d797.ts.net:8443/"
echo "   Email: admin@alyygn.com"
echo "   Password: andlersrv-auth-token-2026"
echo "======================================"
echo ""

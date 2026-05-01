#!/bin/bash
# Deploy Admin UI to production
set -e

echo "🔧 Deploying Admin UI to /var/www/admin/..."

SOURCE="/home/andlersrv/.openclaw/workspace/phase0/apps/admin-ui/dist"
DEST="/var/www/admin"

if [ ! -d "$SOURCE" ]; then
    echo "❌ Build not found. Run: cd phase0/apps/admin-ui && bun run build"
    exit 1
fi

sudo rsync -av --delete "$SOURCE/" "$DEST/"

echo "✅ Admin UI deployed successfully!"
echo ""
echo "Test login at: https://andlersrv.tail62d797.ts.net:8443/login"
echo "Credentials:"
echo "  Email: admin@alyygn.com"
echo "  Password: andlersrv-auth-token-2026"

#!/bin/bash
# Fix Kill Switch Admin UI - Cookie & Deployment
set -e

echo "🔧 Fixing Kill Switch Admin UI..."
echo ""

# 1. Fix nginx config to pass through Set-Cookie headers
echo "1. Fixing nginx proxy configuration..."
sudo sed -i '/location \/v1\/auth\//,/}/ {
    /proxy_set_header Content-Type/a\            \n            # Ensure cookies are passed through\n            proxy_pass_header Set-Cookie;
}' /etc/nginx/nginx.conf

echo "   ✅ Nginx config updated"

# 2. Test nginx config
echo "2. Testing nginx configuration..."
sudo nginx -t
if [ $? -eq 0 ]; then
    echo "   ✅ Nginx config valid"
else
    echo "   ❌ Nginx config test failed!"
    exit 1
fi

# 3. Reload nginx
echo "3. Reloading nginx..."
sudo nginx -s reload
echo "   ✅ Nginx reloaded"

# 4. Deploy Admin UI
echo "4. Deploying Admin UI build..."
SOURCE="/home/andlersrv/.openclaw/workspace/phase0/apps/admin-ui/dist"
DEST="/var/www/admin"

if [ ! -d "$SOURCE" ]; then
    echo "   ❌ Build not found. Building..."
    cd /home/andlersrv/.openclaw/workspace/phase0/apps/admin-ui
    bun run build
fi

sudo rsync -av --delete "$SOURCE/" "$DEST/"
echo "   ✅ Admin UI deployed"

echo ""
echo "🎉 All fixes applied!"
echo ""
echo "Test login at: https://andlersrv.tail62d797.ts.net:8443/login"
echo "Credentials:"
echo "  Email: admin@alyygn.com"
echo "  Password: andlersrv-auth-token-2026"
echo ""
echo "Expected flow:"
echo "  1. Login succeeds → Set-Cookie header received"
echo "  2. Redirect to /kill-switch"
echo "  3. /v1/auth/me returns user data (authenticated)"
echo "  4. Dashboard loads"

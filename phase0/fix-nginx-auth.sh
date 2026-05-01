#!/bin/bash
# Fix nginx auth config - allow login without cookie
set -e

echo "🔧 Fixing nginx auth configuration..."

# Backup current config
sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup.$(date +%Y%m%d-%H%M%S)

# Remove the token validation from /v1/auth/ location (login should be open)
sudo sed -i '/location \/v1\/auth\//,/^[[:space:]]*}/ {
    /set \$auth_token/d
    /if (\$http_cookie/d
    /if (\$auth_token = "")/d
    /return 401;/d
}' /etc/nginx/nginx.conf

# Test config
echo "Testing nginx configuration..."
sudo nginx -t

if [ $? -eq 0 ]; then
    echo "✅ Config valid, reloading nginx..."
    sudo nginx -s reload
    echo "✅ Nginx reloaded!"
    echo ""
    echo "Login should now work at: https://andlersrv.tail62d797.ts.net:8443/login"
    echo "Credentials:"
    echo "  Email: admin@alyygn.com"
    echo "  Password: andlersrv-auth-token-2026"
else
    echo "❌ Config test failed! Restoring backup..."
    sudo cp /etc/nginx/nginx.conf.backup.* /etc/nginx/nginx.conf
    exit 1
fi

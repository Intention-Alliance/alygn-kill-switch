# 🚀 Deploy Commands (Run Manually)

## Problem
Nginx config missing `/v1/auth/` proxy route - getting 405 Not Allowed on login.

## Fix Applied
Updated `/home/andlersrv/.openclaw/workspace/phase0/admin-ui/nginx-root-path.conf` with:

```nginx
# Auth API Proxy - Allow login without auth
location /v1/auth/ {
    proxy_pass http://kill_switch_api/v1/auth/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Allow POST to login without authentication
    proxy_pass_request_body on;
    proxy_set_header Content-Type $content_type;
}
```

## Run These Commands

```bash
# 1. Copy nginx config
sudo cp /home/andlersrv/.openclaw/workspace/phase0/admin-ui/nginx-root-path.conf /etc/nginx/nginx.conf

# 2. Test config
sudo nginx -t

# 3. Reload nginx
sudo systemctl reload nginx

# 4. Copy updated dist (just in case)
sudo cp -r /home/andlersrv/.openclaw/workspace/phase0/admin-ui/dist/* /var/www/admin/

# 5. Fix permissions (http user, not nginx)
sudo chown -R http:http /var/www/admin
```

## Test After Deploy

```bash
# Test auth endpoint
curl -k -X POST https://andlersrv.tail62d797.ts.net:8443/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@alyygn.com","password":"andlersrv-auth-token-2026"}'

# Expected: {"user":{"email":"admin@alyygn.com","role":"admin"}}
```

## Credentials

- **Email:** `admin@alyygn.com`
- **Password:** `andlersrv-auth-token-2026`
- **URL:** `https://andlersrv.tail62d797.ts.net:8443/`

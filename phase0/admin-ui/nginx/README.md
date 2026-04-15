# Admin UI Nginx Deployment Guide

This document covers deploying the Admin UI behind nginx with security hardening.

## Prerequisites

- nginx 1.20+ installed on the server
- SSL certificates generated and available
- Admin UI build artifacts ready to deploy
- Backend API running on `127.0.0.1:3000`

## SSL Certificate Setup

### Generate Self-Signed Certificate (Development)

```bash
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/andlersrv.tail62d797.ts.net.key \
  -out /etc/ssl/private/andlersrv.tail62d797.ts.net.crt \
  -subj "/CN=andlersrv.tail62d797.ts.net"
```

### Production Certificate (Let's Encrypt)

```bash
sudo certbot --nginx -d andlersrv.tail62d797.ts.net
```

### Certificate Permissions

```bash
sudo chmod 600 /etc/ssl/private/andlersrv.tail62d797.ts.net.key
sudo chmod 644 /etc/ssl/private/andlersrv.tail62d797.ts.net.crt
sudo chown root:nginx /etc/ssl/private/andlersrv.tail62d797.ts.net.*
```

## Deployment Steps

### 1. Build the Admin UI

```bash
cd /home/andlersrv/.openclaw/workspace/phase0/admin-ui
npm run build
```

### 2. Deploy Static Files

```bash
sudo mkdir -p /var/www/admin-ui
sudo cp -r dist/* /var/www/admin-ui/
sudo chown -R www-data:www-data /var/www/admin-ui
sudo chmod -R 755 /var/www/admin-ui
```

### 3. Install Nginx Configuration

```bash
sudo cp nginx/admin-ui.conf /etc/nginx/sites-available/admin-ui.conf
sudo ln -sf /etc/nginx/sites-available/admin-ui.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default  # Remove default if conflicting
```

### 4. Test and Reload Nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## IP Allowlist Configuration

The default configuration allows access only from these IPs:

- `100.66.199.80` - Tailscale exit node
- `192.168.1.11` - Local network
- `127.0.0.1` - localhost

### To Add/Remove IPs

Edit the `location /admin/` block in `admin-ui.conf`:

```nginx
set $allowed_ip 0;
if ($remote_addr ~ ^(100\.66\.199\.80|192\.168\.1\.11|127\.0\.0\.1|NEW_IP_HERE)$) {
    set $allowed_ip 1;
}
```

Then reload nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Token Authentication Flow

### 1. User Login

```
POST /v1/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "secure-password"
}
```

### 2. Server Response

- Sets `admin_token` as httpOnly cookie
- Returns user object with role information

### 3. Subsequent Requests

- Token is automatically included via cookie
- Nginx validates presence of `Authorization` header or `admin_token` cookie
- Backend validates token and checks role permissions

### 4. Logout

```
POST /v1/auth/logout
```

- Clears the httpOnly cookie
- Invalidates server-side session

## WebSocket Proxy Setup

The configuration includes WebSocket support for real-time features:

```nginx
location /admin/ws/ {
    proxy_pass http://127.0.0.1:3000/ws/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    # ... additional headers
}
```

### Testing WebSocket Connection

```javascript
const ws = new WebSocket('wss://andlersrv.tail62d797.ts.net/admin/ws/');
ws.onopen = () => console.log('Connected');
ws.onerror = (e) => console.error('Error:', e);
```

## Security Headers Explained

| Header | Purpose |
|--------|---------|
| `Content-Security-Policy` | Prevents XSS by restricting script sources |
| `X-Frame-Options: DENY` | Prevents clickjacking attacks |
| `X-Content-Type-Options: nosniff` | Prevents MIME-type sniffing |
| `Strict-Transport-Security` | Forces HTTPS connections |
| `Referrer-Policy` | Controls referrer information leakage |
| `Permissions-Policy` | Disables browser features (geolocation, camera, etc.) |

## CSP Nonce Generation

For dynamic nonces in server-side rendering:

```typescript
import { generateCspHeaders } from '../src/security/csp';

const nonce = crypto.randomUUID();
const headers = generateCspHeaders({ nonce });
// Include nonce in <script nonce={nonce}> tags
```

## Troubleshooting

### 403 Forbidden on /admin/

- Check if your IP is in the allowlist
- Verify nginx error logs: `sudo tail -f /var/log/nginx/error.log`

### WebSocket Connection Fails

- Ensure backend is listening on `/ws/` path
- Check that `proxy_read_timeout` is set high enough
- Verify SSL certificate is valid (WebSocket requires valid TLS)

### CSP Violations

- Check browser console for CSP error messages
- Adjust `connect-src` directive if adding new API endpoints
- Ensure inline scripts use nonces or hashes

## Maintenance

### Renew SSL Certificate

```bash
sudo certbot renew
sudo systemctl reload nginx
```

### Update Admin UI

```bash
cd /home/andlersrv/.openclaw/workspace/phase0/admin-ui
git pull
npm run build
sudo cp -r dist/* /var/www/admin-ui/
sudo systemctl reload nginx
```

### View Access Logs

```bash
sudo tail -f /var/log/nginx/access.log | grep admin
```
# 🚀 Deploy Commands (Run Manually)

## Quick Deploy (Recommended)

The Admin UI provides two deployment scripts via `package.json`:

| Script          | Command                 | Purpose                                       |
| --------------- | ----------------------- | --------------------------------------------- |
| `deploy:ui`     | `bun run deploy:ui`     | Build & deploy UI static files only           |
| `deploy:server` | `bun run deploy:server` | Full server deployment (nginx + SSL + verify) |

---

## 1. UI-Only Deploy (`scripts/deploy-admin-ui.sh`)

Builds the Admin UI and copies static files to `/var/www/admin/`.

```bash
cd /home/andlersrv/.openclaw/workspace/phase0/apps/admin-ui
bun run deploy:ui
```

**What it does:**

1. Cleans previous `dist/`
2. Installs dependencies (`bun install`)
3. Builds for production (`bun run build`)
4. Copies `dist/*` → `/var/www/admin/`
5. Fixes ownership (`nginx` or `www-data`)
6. Tests and reloads nginx

---

## 2. Full Server Deploy (`scripts/deploy-complete.sh`)

Complete deployment including nginx configuration, SSL permissions, and health checks.

```bash
cd /home/andlersrv/.openclaw/workspace/phase0/apps/admin-ui
bun run deploy:server
```

**What it does:**

1. Backs up current `/etc/nginx/nginx.conf`
2. Deploys `nginx/admin-ui-complete.conf` → `/etc/nginx/nginx.conf`
3. Fixes SSL key permissions (`root:http`, `640`)
4. Verifies `/var/www/admin/index.html` and assets exist
5. Tests nginx configuration (`nginx -t`)
6. Reloads/restarts nginx
7. Verifies services (nginx running, Kill Switch API healthy)
8. Tests endpoints (Admin UI 8443, Ollama proxy 11435)

---

## Manual Steps (Fallback)

If scripts fail, run these manually:

```bash
# 1. Build
cd /home/andlersrv/.openclaw/workspace/phase0/apps/admin-ui
bun install
bun run build

# 2. Deploy static files
sudo mkdir -p /var/www/admin
sudo cp -r dist/* /var/www/admin/
sudo chown -R http:http /var/www/admin

# 3. Deploy nginx config
sudo cp /home/andlersrv/.openclaw/workspace/phase0/apps/admin-ui/nginx/admin-ui-complete.conf /etc/nginx/nginx.conf

# 4. Test & reload
sudo nginx -t
sudo systemctl reload nginx
```

---

## Nginx Configurations

All nginx configs live in `/workspace/phase0/apps/admin-ui/nginx/`:

| File                           | Use Case                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `nginx/admin-ui-complete.conf` | **Default** — Complete config (Admin UI 8443 + Ollama 11435 + HTTP redirect) |
| `nginx/admin-ui-8443.conf`     | Standalone server block for port 8443 only                                   |
| `nginx/admin-ui.legacy.conf`   | Legacy configuration (backup)                                                |

---

## Test After Deploy

```bash
# Test Admin UI
 curl -k -s -o /dev/null -w "%{http_code}" https://localhost:8443/

# Test auth endpoint
curl -k -X POST https://andlersrv.tail62d797.ts.net:8443/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@alyygn.com","password":"andlersrv-auth-token-2026"}'

# Expected: {"user":{"email":"admin@alyygn.com","role":"admin"}}

# Test Kill Switch API health
curl -s http://localhost:3000/v1/kill-switch/health

# Test Ollama proxy
curl -k -s -o /dev/null -w "%{http_code}" https://localhost:11435/
```

---

## Credentials

- **Email:** `admin@alyygn.com`
- **Password:** `andlersrv-auth-token-2026`
- **URL:** `https://andlersrv.tail62d797.ts.net:8443/`

---

## Troubleshooting

**403 Forbidden on /admin/**

- Check IP allowlist in `nginx/admin-ui-complete.conf`
- Verify nginx error logs: `sudo tail -f /var/log/nginx/error.log`

**405 Not Allowed on login**

- Ensure `/v1/auth/` location block exists in nginx config
- Confirm `proxy_pass` points to `kill_switch_api` upstream

**SSL errors**

- Check certificate permissions: `sudo chown root:http /etc/ssl/private/andlersrv.tail62d797.ts.net.key`
- Verify certs exist: `ls -la /etc/ssl/private/andlersrv.tail62d797.ts.net.*`

# Tailscale + Nginx Setup Guide

**Last Updated:** 2026-04-19
**Server:** andlersrv (100.66.199.80)
**Tailnet:** tail62d797.ts.net

---

## Network Architecture

```
Internet
    │
    ├── 192.168.1.1 (Router/Gateway)
    │       └── DNS: 192.168.1.1 (local)
    │
    ├── 192.168.1.117 (Ollama GPU node)
    │
    └── andlersrv (192.168.1.? LAN / 100.66.199.80 Tailscale)
            │
            ├── :11435  → Ollama Proxy (SSL, IP-restricted)
            ├── :8443   → Admin UI + Kill Switch API (SSL, auth-based)
            ├── :3000   → Kill Switch API (localhost only)
            └── :80     → HTTP redirect → HTTPS
```

## Tailscale Network

| Device | Tailscale IP | Status |
|--------|-------------|--------|
| andlersrv | 100.66.199.80 | ✅ Online |
| andler-pro | 100.115.234.1 | ⚠️ Offline (last seen 2d ago) |

### DNS Configuration

- **MagicDNS:** Enabled (suffix: `tail62d797.ts.net`)
- **Split DNS:** `ts.net` → Tailscale DNS servers (199.247.155.53, 2620:111:8007::53)
- **System DNS:** Falls through to systemd-resolved → 192.168.1.1 (router)
- **Health Warning:** "Tailscale can't reach configured DNS servers" — cosmetic, external DNS works fine via systemd-resolved fallback

### Fixing the DNS Health Warning

The warning appears because Tailscale admin console has no custom global nameservers configured. To fix:

1. Go to [Tailscale Admin Console](https://login.tailscale.com/admin/dns)
2. Add global nameservers:
   - `8.8.8.8` (Google DNS)
   - `1.1.1.1` (Cloudflare DNS)
3. Enable "Override local DNS" if you want Tailscale to handle all DNS
4. Or leave as-is (systemd-resolved handles external DNS fine)

**Current status:** DNS works correctly for all external domains. The warning is cosmetic.

## Nginx Configuration

### Port 11435 — Ollama Proxy (SSL, IP-Restricted)

**Purpose:** Secure Ollama API access for approved machines only

**Current Allowlist:**
```nginx
allow   100.66.199.80;    # andlersrv (self)
allow   192.168.1.11;     # Local network (old)
allow   127.0.0.1;        # localhost
deny    all;
```

**⚠️ ISSUE:** `andler-pro` (100.115.234.1) is NOT in the allowlist, blocking remote Ollama access from macOS.

**Fix — Add Tailscale subnet:**
```nginx
# IP Allowlist - Only allow trusted IPs
allow   100.64.0.0/10;    # Tailscale CGNAT range (all tailnet devices)
allow   192.168.1.0/24;   # Local network
allow   127.0.0.1;        # localhost
deny    all;
```

**Why `100.64.0.0/10`:** Tailscale uses the CGNAT range (100.64.0.0 – 100.127.255.255) for tailnet IPs. This allows any device in your tailnet to access Ollama, which is appropriate since:
- Only devices you've authorized are in your tailnet
- Tailscale already authenticates at the network layer
- The SSL cert ensures encrypted transport

### Port 8443 — Admin UI + Kill Switch API (SSL, Auth-Based)

**Purpose:** Kill Switch admin dashboard and API

**Access Control:** No IP restrictions — authentication handled by the application (token + cookie)

### Port 3000 — Kill Switch API (Internal)

**Purpose:** Backend API server (Bun/Elysia)

**Access:** Localhost only — proxied through nginx on 8443

### Port 80 — HTTP Redirect

**Purpose:** Redirect all HTTP traffic to HTTPS

## How to Apply Changes

### 1. Edit Nginx Config (requires sudo)

```bash
# Backup current config
sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup.$(date +%Y%m%d)

# Edit the allowlist
sudo nano /etc/nginx/nginx.conf

# In the port 11435 server block, replace:
#   allow   100.66.199.80;
#   allow   192.168.1.11;
#   allow   127.0.0.1;
# With:
#   allow   100.64.0.0/10;    # Tailscale CGNAT range
#   allow   192.168.1.0/24;   # Local network
#   allow   127.0.0.1;        # localhost

# Test config
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### 2. Fix Tailscale DNS Warning (optional)

```bash
# Option A: Restart tailscaled (clears stale health checks)
sudo systemctl restart tailscaled

# Option B: Add nameservers in Tailscale admin console
# Go to https://login.tailscale.com/admin/dns
# Add 8.8.8.8 and 1.1.1.1 as global nameservers
```

### 3. Verify Ollama Access from Remote

```bash
# From andler-pro (macOS) via Tailscale:
curl -sk https://andlersrv.tail62d797.ts.net:11435/api/tags

# Should return model list (29 models)
```

## SSL Certificates

- **Location:** `/etc/ssl/private/andlersrv.tail62d797.ts.net.crt` and `.key`
- **Domain:** `andlersrv.tail62d797.ts.net`
- **Source:** Tailscale auto-generates certs for MagicDNS names
- **Renewal:** Automatic via Tailscale

## Ollama Cluster Configuration

```nginx
upstream ollama_cluster {
    server 192.168.1.117:11434  max_fails=3 fail_timeout=30s max_conns=3;
    server 127.0.0.1:11434      backup;
}
```

- **Primary:** 192.168.1.117 (GPU node) — 3 max concurrent connections
- **Backup:** 127.0.0.1 (localhost) — used when primary is down
- **Timeouts:** 5400s read/send (long-running model inference), 5s connect

## Troubleshooting

### "Can't reach Ollama from remote machine"

1. Check nginx allowlist includes Tailscale subnet (`100.64.0.0/10`)
2. Verify SSL cert is valid: `openssl x509 -in /etc/ssl/private/andlersrv.tail62d797.ts.net.crt -noout -dates`
3. Check Tailscale is running: `tailscale status`
4. Verify port is listening: `ss -tlnp | grep 11435`

### "Tailscale DNS warning"

- Cosmetic — external DNS works via systemd-resolved fallback
- Fix by adding global nameservers in Tailscale admin console
- Or restart tailscaled: `sudo systemctl restart tailscaled`

### "Supabase DNS resolution fails"

- The Supabase project `uwusstfgikzeryvaruuk` doesn't resolve even via Google DNS (8.8.8.8)
- This means the project is likely **paused or deleted** on Supabase's end
- Fix: Log into Supabase dashboard, unpause or recreate the project
- Update `config/credentials.json` with the new project URL if recreated
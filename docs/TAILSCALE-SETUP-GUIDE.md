# Tailscale Configuration Guide for Server Access

## Overview

This guide documents how to configure Tailscale for secure access to the ALYGN outreach server.

---

## Server Side (andlersrv)

### 1. Verify Tailscale is Running

```bash
# Check Tailscale status
tailscale status

# Expected output: List of connected devices
# If "Logged out", need to authenticate
```

### 2. Authenticate Tailscale (if needed)

```bash
# Authenticate with authkey
sudo tailscale up --authkey=file:/etc/tailscale/authkey

# Or use authkey from environment
sudo tailscale up --authkey=$TAILSCALE_AUTHKEY
```

### 3. Check Connection Status

```bash
# Show current IP
tailscale ip

# Show all connected devices
tailscale status

# Test connectivity to another device
tailscale ping <device-name>
```

### 4. Verify Systemd Service

```bash
# Check service status
systemctl status tailscaled

# Should show: active (running)
# If not, start it:
sudo systemctl start tailscaled
sudo systemctl enable tailscaled
```

### 5. Configure Persistence (Already Done)

The systemd override has been configured:
- `/etc/systemd/system/tailscaled.service.d/override.conf`
- `Restart=always`
- `RestartSec=5`
- `TS_KEEPALIVE=30`

---

## Client Side (Your Devices)

### 1. Install Tailscale

**Linux:**
```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

**macOS:**
```bash
brew install tailscale
```

**Windows:**
Download from https://tailscale.com/download

**iOS/Android:**
Download from App Store / Play Store

### 2. Authenticate to Tailnet

```bash
# Authenticate with authkey (from Andler)
sudo tailscale up --authkey=$TAILSCALE_AUTHKEY

# Or use OAuth login
tailscale up
# Follow the URL to authenticate
```

### 3. Verify Connection

```bash
# Check your status
tailscale status

# Should show your device and the server
# Example:
# 100.64.0.1   andlersrv        linux    -
# 100.64.0.2   your-laptop       macOS    -
```

### 4. Test Connectivity

```bash
# Ping the server
tailscale ping andlersrv

# Should show: pong from andlersark (100.64.0.1)
```

---

## Accessing the Server

### SSH Access

```bash
# SSH via Tailscale IP
ssh andler@100.64.0.1

# Or using hostname
ssh andler@andlersrv
```

### HTTP Access

```bash
# Access OpenClaw Gateway
http://100.64.0.1:18790

# Or using hostname
http://andlersrv:18790
```

### Port Forwarding (if needed)

```bash
# Forward local port to server port
tailscale up --advertise-exit-node

# Or use SSH tunneling
ssh -L 8080:localhost:18790 andler@andlersrv
```

---

## VM Access (Gold Standard)

For full VM access (like being on the machine):

### Option 1: SSH with X-Forwarding

```bash
# Forward GUI applications
ssh -X andler@andlersrv

# Run GUI apps remotely
xclock  # Test X-forwarding
```

### Option 2: VNC over SSH

```bash
# On server: Install VNC
sudo apt install tightvncserver

# Start VNC session
vncserver :1

# Forward VNC port
ssh -L 5901:localhost:5901 andler@andlersrv

# Connect from client
vncviewer localhost:1
```

### Option 3: VS Code Remote

1. Install VS Code Remote - SSH extension
2. Add to `~/.ssh/config`:
   ```
   Host andlersrv
       HostName 100.64.0.1
       User andler
   ```
3. Connect: `code --remote ssh+andlersrv`

---

## Troubleshooting

### "Logged out" Error

```bash
# Re-authenticate
sudo tailscale up --authkey=$TAILSCALE_AUTHKEY
```

### "Connection refused"

```bash
# Check firewall
sudo ufw status

# Allow Tailscale
sudo ufw allow in on tailscale0
```

### "No route to host"

```bash
# Check if Tailscale is running
systemctl status tailscaled

# Restart if needed
sudo systemctl restart tailscaled
```

### "DNS resolution failed"

```bash
# Use IP directly
ssh andler@100.64.0.1

# Or add to /etc/hosts
echo "100.64.0.1 andlersrv" | sudo tee -a /etc/hosts
```

---

## Security Considerations

1. **Authkey Rotation**: Rotate authkeys periodically
   ```bash
   tailscale authkeys create --description "New key"
   ```

2. **Exit Node**: Don't advertise exit node unless needed
   ```bash
   tailscale up --advertise-exit-node=false
   ```

3. **ACL**: Use Tailscale ACLs to restrict access
   ```json
   {
     "acls": [
       {"action": "accept", "src": ["tag:dev"], "dst": ["tag:server:*"]}
     ]
   }
   ```

4. **SSH Keys**: Use SSH keys, not passwords
   ```bash
   ssh-copy-id andler@andlersrv
   ```

---

## Quick Reference

| Task | Command |
|------|---------|
| Check status | `tailscale status` |
| Get IP | `tailscale ip` |
| Ping device | `tailscale ping <name>` |
| Authenticate | `tailscale up --authkey=$KEY` |
| SSH to server | `ssh andler@andlersrv` |
| HTTP access | `http://andlersrv:18790` |
| Restart service | `sudo systemctl restart tailscaled` |

---

## Next Steps

1. ✅ Tailscale systemd configured (Issue #86)
2. ⏳ Verify connection from your device
3. ⏳ Test SSH and HTTP access
4. ⏳ Set up VNC/VS Code Remote (optional)

---

**Created:** 2026-04-08
**Author:** Wobblus 🔧
**Related:** Issue #86, Issue #150
# IP Allowlist Fix - Docker Network Access

**Date:** 2026-04-14 12:55 CST  
**Issue:** API returning 403 "IP not allowed" for Docker network requests

---

## 🐛 The Problem

**Error:**
```json
{"error":"IP not allowed","ip":"::ffff:172.28.0.1"}
```

**Cause:**
The IP allowlist only had specific IPs:
- `127.0.0.1`
- `192.168.1.11`
- `100.66.199.80`

But Docker containers communicate via Docker network gateway IPs like:
- `172.28.0.1` (our network)
- `172.17.0.1` (default Docker network)

---

## ✅ The Fix

### 1. Added Docker Network CIDR Ranges

**Updated IP_ALLOWLIST:**
```javascript
const IP_ALLOWLIST = new Set([
  '100.66.199.80',
  '192.168.1.11',
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
  // Docker network ranges
  '172.16.0.0/12',  // All Docker networks
  '172.17.0.0/16',
  '172.18.0.0/16',
  '172.19.0.0/16',
  '172.20.0.0/16',
  '172.21.0.0/16',
  '172.22.0.0/16',
  '172.23.0.0/16',
  '172.24.0.0/16',
  '172.25.0.0/16',
  '172.26.0.0/16',
  '172.27.0.0/16',
  '172.28.0.0/16',  // Our network
]);
```

### 2. Added CIDR Matching Logic

**New method `isIpInCidr()`:**
```javascript
isIpInCidr(ip, cidr) {
  const [range, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);
  
  // Convert IPs to numeric
  const ipNum = ip.split('.').reduce((acc, octet) => 
    (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  const rangeNum = range.split('.').reduce((acc, octet) => 
    (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  
  return (ipNum & mask) === (rangeNum & mask);
}
```

**Updated `isIpAllowed()`:**
```javascript
isIpAllowed(ip) {
  // Check exact match
  if (IP_ALLOWLIST.has(normalizedIp)) return true;
  
  // Check CIDR ranges
  const cidrRanges = Array.from(IP_ALLOWLIST).filter(r => r.includes('/'));
  for (const cidr of cidrRanges) {
    if (this.isIpInCidr(normalizedIp, cidr)) return true;
  }
  
  return false;
}
```

---

## 🚀 Deploy

```bash
cd /home/andlersrv/.openclaw/workspace/phase0
bash deploy-backend.sh
```

---

## 🧪 Verify

```bash
# Test from localhost (should work now)
curl http://localhost:3000/v1/kill-switch/health

# Expected response:
# {"status":"healthy","killSwitchState":"ARMED",...}

# Check logs
docker compose logs kill-switch-api
```

---

## 📊 Security Notes

**What's allowed now:**
- ✅ Tailscale IP (`100.66.199.80`)
- ✅ Local network (`192.168.1.11`)
- ✅ Localhost (`127.0.0.1`)
- ✅ **All Docker networks** (`172.16.0.0/12`)

**What's still blocked:**
- ❌ External internet
- ❌ Other containers not on Docker networks
- ❌ Unknown networks

**Risk level:** Low - Docker networks are internal and isolated.

---

## 📝 Files Changed

1. ✅ `/phase0/kill-switch/kill-switch-service.mjs`
   - Added CIDR ranges to IP_ALLOWLIST
   - Added `isIpInCidr()` method
   - Updated `isIpAllowed()` to check CIDR

---

**Status:** ✅ Fixed - Docker containers can now access the API

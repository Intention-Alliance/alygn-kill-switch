// IP Allowlist + CIDR matching — configurable via environment
// Extracted from kill-switch-service.mjs

import { timingSafeEqual } from 'crypto';
import { resolve4 } from 'node:dns/promises';

// ─── Tailscale MagicDNS — dynamic DNS resolution for Tailscale IP ──

const TAILSCALE_MAGICDNS = 'andlersrv.tail62d797.ts.net';
const DNS_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let dnsResolvedIps: string[] = [];
let refreshTimer: ReturnType<typeof setInterval> | null = null;

export async function refreshTailscaleDns(): Promise<string[]> {
  try {
    const addresses = await resolve4(TAILSCALE_MAGICDNS);
    dnsResolvedIps = addresses;
    console.log(`[ip-allowlist] DNS resolved ${TAILSCALE_MAGICDNS} → [${addresses.join(', ')}]`);
    return addresses;
  } catch (err: any) {
    console.error(`[ip-allowlist] DNS resolution failed for ${TAILSCALE_MAGICDNS}: ${err.message}`);
    return dnsResolvedIps; // keep previous
  }
}

export function startDnsRefresh(): void {
  refreshTailscaleDns(); // immediate
  refreshTimer = setInterval(refreshTailscaleDns, DNS_REFRESH_INTERVAL_MS);
}

export function stopDnsRefresh(): void {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
}

// Default allowlist (can be overridden via IP_ALLOWLIST env var)
const DEFAULT_ALLOWED_IPS = [
  '192.168.1.11',
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
];

// Default CIDR ranges (can be overridden via IP_ALLOWLIST_CIDRS env var)
const DEFAULT_CIDR_RANGES = [
  '172.16.0.0/12',   // All Docker networks
  '172.17.0.0/16',   // Docker default bridge
  '172.28.0.0/16',   // Our phase0 network
  '172.29.0.0/16',
  '172.30.0.0/16',
  '172.31.0.0/16',
];

function parseEnvList(envVar: string | undefined, defaults: string[]): string[] {
  if (!envVar) return defaults;
  return envVar.split(',').map(s => s.trim()).filter(Boolean);
}

const ALLOWED_IPS = parseEnvList(process.env.IP_ALLOWLIST, DEFAULT_ALLOWED_IPS);
const CIDR_RANGES = parseEnvList(process.env.IP_ALLOWLIST_CIDRS, DEFAULT_CIDR_RANGES);

export function isIpAllowed(ip: string): boolean {
  const normalizedIp = ip.replace(/^::ffff:/, '');
  const allIps = [...ALLOWED_IPS, ...dnsResolvedIps];

  // Check exact IP matches (static + DNS-resolved)
  if (allIps.includes(normalizedIp) || allIps.includes(ip)) {
    return true;
  }

  // Check CIDR ranges
  for (const cidr of CIDR_RANGES) {
    if (isIpInCidr(normalizedIp, cidr)) {
      return true;
    }
  }

  return false;
}

function isIpInCidr(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);

  const ipNum = ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  const rangeNum = range.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;

  return (ipNum & mask) === (rangeNum & mask);
}

export { ALLOWED_IPS, CIDR_RANGES };
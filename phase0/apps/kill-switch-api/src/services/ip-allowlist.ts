// IP Allowlist + CIDR matching
// Extracted from kill-switch-service.mjs

const IP_ALLOWLIST = new Set([
  '100.66.199.80',
  '192.168.1.11',
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
  // Docker network IPs
  '172.16.0.0/12',
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
  '172.28.0.0/16',
]);

export function isIpAllowed(ip: string): boolean {
  const normalizedIp = ip.replace(/^::ffff:/, '');

  if (IP_ALLOWLIST.has(normalizedIp) || IP_ALLOWLIST.has(ip)) {
    return true;
  }

  const cidrRanges = Array.from(IP_ALLOWLIST).filter((r) => r.includes('/'));
  for (const cidr of cidrRanges) {
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

export { IP_ALLOWLIST };
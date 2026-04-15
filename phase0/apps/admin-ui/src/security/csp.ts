export interface CspConfig {
  nonce?: string;
  reportUri?: string;
  connectSrc?: string[];
}

export function generateCspHeaders(config: CspConfig = {}): Record<string, string> {
  const {
    nonce,
    reportUri,
    connectSrc = ['wss://andlersrv.tail62d797.ts.net:11435'],
  } = config;

  const nonceDirective = nonce ? `'nonce-${nonce}'` : '';

  const directives: Record<string, string> = {
    'default-src': "'self'",
    'script-src': `'self' ${nonceDirective}`.trim(),
    'style-src': "'self' 'unsafe-inline'", // Tailwind requires unsafe-inline
    'connect-src': [
      "'self'",
      ...connectSrc,
    ].join(' '),
    'img-src': "'self' data:",
    'frame-ancestors': "'none'",
    'base-uri': "'self'",
    'form-action': "'self'",
    'object-src': "'none'",
    'upgrade-insecure-requests': '',
  };

  if (reportUri) {
    directives['report-uri'] = reportUri;
    directives['report-to'] = 'csp-endpoint';
  }

  const cspHeader = Object.entries(directives)
    .filter(([, value]) => value !== '')
    .map(([directive, value]) => `${directive} ${value}`.trim())
    .join('; ');

  return {
    'Content-Security-Policy': cspHeader,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  };
}

export function generateNginxCspDirectives(config: CspConfig = {}): string {
  const headers = generateCspHeaders(config);

  return Object.entries(headers)
    .map(([header, value]) => `add_header ${header} "${value}" always;`)
    .join('\n  ');
}
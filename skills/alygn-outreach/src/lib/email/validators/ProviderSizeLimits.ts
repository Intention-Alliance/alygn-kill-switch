/**
 * ProviderSizeLimits — F-073
 * Pre-configured size limits per email provider with custom registration.
 */

import type { TemplateSizeConstraints } from './TemplateValidator';

// ---------------------------------------------------------------------------
// Provider presets
// ---------------------------------------------------------------------------

const PROVIDER_LIMITS: Record<string, TemplateSizeConstraints> = {
  sendgrid: {
    maxHtmlBytes: 10 * 1024 * 1024, // 10 MB
    maxSubjectChars: 78,
    maxTextBytes: 10 * 1024 * 1024, // 10 MB
  },
  gmail: {
    maxHtmlBytes: 102 * 1024, // 102 KB
    maxSubjectChars: 78,
    maxTextBytes: 102 * 1024,
  },
  outlook: {
    maxHtmlBytes: 3500, // strict!
    maxSubjectChars: 78,
    maxTextBytes: 1500,
  },
  smtp: {
    maxHtmlBytes: 1024 * 1024, // 1 MB
    maxSubjectChars: 78,
    maxTextBytes: 1024 * 1024,
  },
};

// Clone so custom registrations don't mutate the defaults
const registry: Map<string, TemplateSizeConstraints> = new Map(
  Object.entries(PROVIDER_LIMITS).map(([k, v]) => [k, { ...v }]),
);

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** Get size limits for a provider (case-insensitive). Falls back to SMTP defaults. */
export function getLimits(providerName: string): TemplateSizeConstraints {
  const key = providerName.toLowerCase();
  const limits = registry.get(key);
  if (limits) return { ...limits };
  // Default to generic SMTP limits
  return { ...PROVIDER_LIMITS.smtp };
}

/** Register or override limits for a custom provider. */
export function registerLimits(
  providerName: string,
  limits: Partial<TemplateSizeConstraints>,
): void {
  const key = providerName.toLowerCase();
  const base = registry.get(key) ?? { ...PROVIDER_LIMITS.smtp };
  registry.set(key, { ...base, ...limits });
}

/** List all registered provider names. */
export function listProviders(): string[] {
  return Array.from(registry.keys());
}

export default { getLimits, registerLimits, listProviders };
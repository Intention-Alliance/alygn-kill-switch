/**
 * White-label branding configuration for the Regulator web app.
 *
 * All user-facing brand strings are read from NEXT_PUBLIC_* env vars so a
 * single build can be re-skinned per deployment (docker, vercel, self-host).
 * When no vars are set, the defaults reproduce the original ALYGN Regulator
 * UI exactly.
 *
 * NOTE: NEXT_PUBLIC_* vars are inlined at build time — changing them after a
 * build requires a rebuild, not just a process restart.
 */

/** Compact brand mark (sidebar logo, dashboard title prefixes). */
export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? "ALYGN";

/** Full product name (headers, page titles, About card). */
export const BRAND_FULL_NAME =
  process.env.NEXT_PUBLIC_BRAND_FULL_NAME ?? "ALYGN Regulator";

/** One-line value proposition shown under headings / in the footer. */
export const BRAND_TAGLINE =
  process.env.NEXT_PUBLIC_BRAND_TAGLINE ??
  "Sovereign Compliance Infrastructure for AI Safety";

/** Credit line rendered in the sidebar footer. */
export const BRAND_FOOTER_CREDIT =
  process.env.NEXT_PUBLIC_BRAND_FOOTER_CREDIT ??
  "Powered by ALYGN Kill Switch, the Dignity Runtime";

/** App version shown in the sidebar footer and About card. */
export const BRAND_VERSION = "v2.0.0";

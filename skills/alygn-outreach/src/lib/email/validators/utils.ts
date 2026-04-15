/**
 * Shared validator utilities — F-073
 * Common helpers extracted from TemplateOptimizer + TemplateValidator.
 */

/** UTF-8 byte length. Fast path for ASCII, TextEncoder fallback for multi-byte. */
export function byteLength(str: string): number {
  if (/^[\x00-\x7F]*$/.test(str)) return str.length;
  return new TextEncoder().encode(str).length;
}
// Timing-safe string comparison — prevents timing attacks
// Use this for ALL auth token comparisons instead of ===

import { timingSafeEqual } from 'crypto';

/**
 * Compare two strings in constant time to prevent timing attacks.
 * Returns true only if both strings are non-empty and equal.
 * Handles undefined/null gracefully by returning false.
 */
export function secureCompare(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
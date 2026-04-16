/**
 * TemplateCache — F-080
 * LRU render cache for TemplateEngine to avoid re-parsing and re-rendering
 * identical templates.
 *
 * Features:
 *   LRU eviction when max size is reached
 *   TTL-based invalidation (default 5 min)
 *   Cache key = hash of template string + data shape + locale
 *   Stores parsed AST + rendered output
 *   hit/miss counters for monitoring
 *   invalidate(templateName) for specific template
 *   invalidateAll() for full flush
 *
 * TypeScript strict mode. No external dependencies.
 */

import type { Locale } from './Locale';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Cached entry containing both parsed AST and rendered output. */
export interface CacheEntry {
  /** Parsed AST nodes (for potential reuse). */
  ast: unknown[];
  /** Rendered output string. */
  output: string;
  /** Timestamp when this entry was stored (epoch ms). */
  storedAt: number;
}

/** Configuration options for TemplateCache. */
export interface TemplateCacheOptions {
  /** Maximum number of entries in the cache. Default: 100. */
  maxSize?: number;
  /** Time-to-live in milliseconds. Entries older than this are evicted on access. Default: 300000 (5 min). */
  ttlMs?: number;
}

/** Cache statistics for monitoring. */
export interface CacheStats {
  /** Number of cache hits. */
  hits: number;
  /** Number of cache misses. */
  misses: number;
  /** Current number of entries in the cache. */
  size: number;
  /** Maximum cache size. */
  maxSize: number;
  /** Hit rate as a number between 0 and 1 (0 if no lookups yet). */
  hitRate: number;
}

/** Callback type for cache hit/miss events (F-084). */
export type CacheEventCallback = (templateName: string) => void;

// ---------------------------------------------------------------------------
// Simple hash function (FNV-1a 32-bit)
// No external deps — fast, decent distribution for cache keys
// ---------------------------------------------------------------------------

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0; // Keep unsigned 32-bit
  }
  return hash;
}

/**
 * Produce a stable cache key from template string, data shape, and locale.
 * Data shape = sorted keys of the top-level data object (values not included,
 * since identical keys + template + locale means identical rendering).
 */
export function computeCacheKey(
  template: string,
  data: Record<string, unknown>,
  locale?: Locale | string,
): string {
  // Sort keys to get a stable shape fingerprint
  const keys = Object.keys(data).sort();
  const shape = keys.join(',');
  const localeCode = typeof locale === 'string' ? locale : locale?.code ?? '';

  // Combine and hash
  const raw = `${template}\0${shape}\0${localeCode}`;
  return fnv1a32(raw).toString(36);
}

// ---------------------------------------------------------------------------
// TemplateCache class
// ---------------------------------------------------------------------------

export class TemplateCache {
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private readonly entries: Map<string, CacheEntry>;
  private hits = 0;
  private misses = 0;

  /** F-084: Callbacks for cache hit/miss events. */
  private onHitCallback?: CacheEventCallback;
  private onMissCallback?: CacheEventCallback;

  constructor(options?: TemplateCacheOptions) {
    this.maxSize = options?.maxSize ?? 100;
    this.ttlMs = options?.ttlMs ?? 5 * 60 * 1000; // 5 minutes
    this.entries = new Map();
  }

  /**
   * Get a cached entry by key.
   * Returns undefined on miss (including TTL-expired entries, which are evicted).
   */
  get(key: string, templateName?: string): CacheEntry | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      this.misses++;
      if (this.onMissCallback && templateName) {
        this.onMissCallback(templateName);
      }
      return undefined;
    }

    // TTL check
    if (Date.now() - entry.storedAt > this.ttlMs) {
      this.entries.delete(key);
      // Clean nameIndex: remove this key from all template name sets
      for (const [, keys] of this.nameIndex) {
        keys.delete(key);
      }
      // Remove empty nameIndex entries
      for (const [name, keys] of this.nameIndex) {
        if (keys.size === 0) {
          this.nameIndex.delete(name);
        }
      }
      this.misses++;
      if (this.onMissCallback && templateName) {
        this.onMissCallback(templateName);
      }
      return undefined;
    }

    // LRU: move to end (most recently used)
    this.entries.delete(key);
    this.entries.set(key, entry);

    this.hits++;
    if (this.onHitCallback && templateName) {
      this.onHitCallback(templateName);
    }
    return entry;
  }

  /**
   * Store an entry in the cache. Evicts the least-recently-used entry
   * if the cache is at max capacity.
   */
  set(key: string, entry: CacheEntry): void {
    // If key already exists, delete first to re-insert at end (LRU order)
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }

    // Evict LRU (first entry in Map iteration order) if at capacity
    if (this.entries.size >= this.maxSize) {
      const lruKey = this.entries.keys().next().value;
      if (lruKey !== undefined) {
        this.entries.delete(lruKey);
        // Clean nameIndex for evicted key
        for (const [, keys] of this.nameIndex) {
          keys.delete(lruKey);
        }
        for (const [name, keys] of this.nameIndex) {
          if (keys.size === 0) {
            this.nameIndex.delete(name);
          }
        }
      }
    }

    this.entries.set(key, entry);
  }

  /**
   * Invalidate all cache entries whose key was derived from a given template name.
   *
   * Since cache keys are hashes, we cannot reverse-lookup by template name directly.
   * Instead, we maintain a secondary index: templateName → Set<cacheKey>.
   * This method uses that index.
   */
  private readonly nameIndex: Map<string, Set<string>> = new Map();

  /**
   * Associate a cache key with a template name (called during set).
   * This enables invalidate-by-template-name.
   */
  associateKey(templateName: string, cacheKey: string): void {
    let keys = this.nameIndex.get(templateName);
    if (!keys) {
      keys = new Set();
      this.nameIndex.set(templateName, keys);
    }
    keys.add(cacheKey);
  }

  /**
   * Invalidate all cached entries for a specific template name.
   * Useful when a new version of a template is registered.
   */
  invalidate(templateName: string): number {
    const keys = this.nameIndex.get(templateName);
    if (!keys) return 0;

    let count = 0;
    for (const key of keys) {
      if (this.entries.delete(key)) {
        count++;
      }
    }
    this.nameIndex.delete(templateName);
    return count;
  }

  /**
   * Invalidate all cached entries. Full flush.
   */
  invalidateAll(): number {
    const count = this.entries.size;
    this.entries.clear();
    this.nameIndex.clear();
    return count;
  }

  /**
   * Get cache statistics for monitoring.
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.entries.size,
      maxSize: this.maxSize,
      hitRate: total === 0 ? 0 : this.hits / total,
    };
  }

  /**
   * Reset hit/miss counters (useful for per-interval stats).
   */
  resetCounters(): void {
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Prune all TTL-expired entries from the cache.
   * Called opportunistically; not required for correctness since get() checks TTL.
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.entries) {
      if (now - entry.storedAt > this.ttlMs) {
        this.entries.delete(key);
        pruned++;
      }
    }
    // Also clean up nameIndex entries whose keys no longer exist
    for (const [name, keys] of this.nameIndex) {
      for (const key of keys) {
        if (!this.entries.has(key)) {
          keys.delete(key);
        }
      }
      if (keys.size === 0) {
        this.nameIndex.delete(name);
      }
    }
    return pruned;
  }

  // -----------------------------------------------------------------------
  // F-084: Cache event callbacks
  // -----------------------------------------------------------------------

  /**
   * Set the onHit callback. Called on every cache hit with the template name.
   */
  setOnHit(callback: CacheEventCallback): void {
    this.onHitCallback = callback;
  }

  /**
   * Set the onMiss callback. Called on every cache miss with the template name.
   */
  setOnMiss(callback: CacheEventCallback): void {
    this.onMissCallback = callback;
  }

  /**
   * Get the current onHit callback.
   */
  getOnHit(): CacheEventCallback | undefined {
    return this.onHitCallback;
  }

  /**
   * Get the current onMiss callback.
   */
  getOnMiss(): CacheEventCallback | undefined {
    return this.onMissCallback;
  }
}

export default TemplateCache;
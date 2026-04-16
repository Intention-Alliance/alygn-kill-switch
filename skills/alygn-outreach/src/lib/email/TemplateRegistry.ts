/**
 * TemplateRegistry — F-071
 * Registry for versioned email templates.
 *
 * Stores template versions with their content and metadata.
 * Persists to data/template-registry.json.
 * Supports registering, retrieving, and listing template versions.
 */

import fs from 'fs';
import path from 'path';
import { TemplateVersion } from './TemplateVersion';
import { TemplatePermissions, type Role } from './TemplatePermissions';
import { TemplateAccessControl, TemplateAccessError } from './TemplateAccessControl';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateEntry {
  name: string;
  version: string;
  content: string;
  metadata?: Record<string, unknown>;
  registeredAt: string;
}

interface RegistryData {
  templates: Record<string, TemplateEntry[]>;
  lastUpdated: string | null;
}

// ---------------------------------------------------------------------------
// Persistence path (self-contained within skill)
// ---------------------------------------------------------------------------

const SKILL_DATA_DIR = path.resolve(__dirname, '../../data');
const REGISTRY_FILE = path.resolve(SKILL_DATA_DIR, 'template-registry.json');

// ---------------------------------------------------------------------------
// TemplateRegistry class
// ---------------------------------------------------------------------------

export class TemplateRegistry {
  private data: RegistryData;

  /** Optional render cache — auto-invalidated on register (F-080). */
  private cache?: import('./TemplateCache').TemplateCache;

  /** Optional access control (F-083). */
  private accessControl?: TemplateAccessControl;
  private permissions?: TemplatePermissions;
  private role?: Role;

  constructor(options?: { permissions?: TemplatePermissions; role?: Role; accessControl?: TemplateAccessControl }) {
    if (!fs.existsSync(SKILL_DATA_DIR)) {
      fs.mkdirSync(SKILL_DATA_DIR, { recursive: true });
    }
    this.data = this.load();

    // F-083: Optional access control integration
    if (options?.permissions && options?.role) {
      this.permissions = options.permissions;
      this.role = options.role;
      this.accessControl = options.accessControl ?? new TemplateAccessControl();
    }
  }

  /**
   * Set the render cache for auto-invalidation (F-080).
   * When a new template version is registered, cache entries for that
   * template name are automatically invalidated.
   */
  setCache(cache: import('./TemplateCache').TemplateCache): void {
    this.cache = cache;
  }

  /**
   * Get the render cache (F-080).
   */
  getCache(): import('./TemplateCache').TemplateCache | undefined {
    return this.cache;
  }

  // ---------------------------------------------------------------------------
  // Core operations
  // ---------------------------------------------------------------------------

  /**
   * Register a template version.
   * If this exact version already exists, it is overwritten (idempotent).
   */
  register(
    name: string,
    version: TemplateVersion | string,
    content: string,
    metadata?: Record<string, unknown>,
  ): TemplateEntry {
    const v = typeof version === 'string' ? TemplateVersion.parse(version) : version;
    const entry: TemplateEntry = {
      name,
      version: v.toString(),
      content,
      metadata,
      registeredAt: new Date().toISOString(),
    };

    if (!this.data.templates[name]) {
      this.data.templates[name] = [];
    }

    const versions = this.data.templates[name];
    const existingIdx = versions.findIndex((e) => e.version === v.toString());

    if (existingIdx >= 0) {
      // Preserve original registration date on overwrite
      entry.registeredAt = versions[existingIdx].registeredAt;
      versions[existingIdx] = entry;
    } else {
      versions.push(entry);
    }

    // Sort versions descending (newest first)
    versions.sort((a, b) => {
      const va = TemplateVersion.parse(a.version);
      const vb = TemplateVersion.parse(b.version);
      return vb.isNewerThan(va) ? 1 : va.isNewerThan(vb) ? -1 : 0;
    });

    this.data.lastUpdated = new Date().toISOString();
    this.save();

    // F-080: Auto-invalidate cache when a new version is registered
    if (this.cache) {
      this.cache.invalidate(name);
    }

    return entry;
  }

  /**
   * Get a specific version of a template, or the latest if no version specified.
   * Returns null if the template (or version) doesn't exist.
   */
  get(name: string, version?: TemplateVersion | string): TemplateEntry | null {
    const versions = this.data.templates[name];
    if (!versions || versions.length === 0) return null;

    if (version === undefined) {
      // Return latest (first, since sorted newest-first)
      return versions[0];
    }

    const vStr = typeof version === 'string' ? version : version.toString();
    return versions.find((e) => e.version === vStr) ?? null;
  }

  /**
   * Get the latest version of a template.
   * Returns null if the template doesn't exist.
   */
  getLatest(name: string): TemplateEntry | null {
    const versions = this.data.templates[name];
    if (!versions || versions.length === 0) return null;
    return versions[0]; // sorted newest-first
  }

  /**
   * List all versions of a template, newest first.
   * Returns empty array if the template doesn't exist.
   */
  listVersions(name: string): TemplateEntry[] {
    return this.data.templates[name] ?? [];
  }

  /**
   * List all template names in the registry.
   */
  listTemplateNames(): string[] {
    return Object.keys(this.data.templates);
  }

  /**
   * Check if a specific version of a template exists.
   */
  has(name: string, version?: TemplateVersion | string): boolean {
    if (version === undefined) {
      return !!this.data.templates[name]?.length;
    }
    return this.get(name, version) !== null;
  }

  /**
   * Remove a specific version of a template.
   * Returns true if the version was found and removed.
   */
  removeVersion(name: string, version: TemplateVersion | string): boolean {
    const versions = this.data.templates[name];
    if (!versions) return false;

    const vStr = typeof version === 'string' ? version : version.toString();
    const idx = versions.findIndex((e) => e.version === vStr);
    if (idx === -1) return false;

    versions.splice(idx, 1);
    if (versions.length === 0) {
      delete this.data.templates[name];
    }
    this.data.lastUpdated = new Date().toISOString();
    this.save();
    return true;
  }

  /**
   * Remove all versions of a template.
   * Returns the number of versions removed.
   */
  removeTemplate(name: string): number {
    const versions = this.data.templates[name];
    if (!versions) return 0;
    const count = versions.length;
    delete this.data.templates[name];
    this.data.lastUpdated = new Date().toISOString();
    this.save();
    return count;
  }

  // ---------------------------------------------------------------------------
  // Access Control (F-083)
  // ---------------------------------------------------------------------------

  /**
   * Get a permission-enforced proxy of this registry for the given role.
   * Returns the original registry (no proxy) if no permissions were configured.
   */
  withAccess(role: Role, permissions?: TemplatePermissions): TemplateRegistry {
    const perms = permissions ?? this.permissions;
    if (!perms) return this;
    const ac = this.accessControl ?? new TemplateAccessControl();
    return ac.wrap(this, perms, role);
  }

  /**
   * Get the underlying access control instance (if configured).
   */
  getAccessControl(): TemplateAccessControl | undefined {
    return this.accessControl;
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  private load(): RegistryData {
    try {
      if (fs.existsSync(REGISTRY_FILE)) {
        return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')) as RegistryData;
      }
    } catch (e) {
      const err = e as Error;
      console.error('[TemplateRegistry] Error loading registry:', err.message);
    }
    return { templates: {}, lastUpdated: null };
  }

  private save(): void {
    try {
      fs.writeFileSync(REGISTRY_FILE, JSON.stringify(this.data, null, 2));
    } catch (e) {
      const err = e as Error;
      console.error('[TemplateRegistry] Error saving registry:', err.message);
    }
  }
}

export default TemplateRegistry;

// Re-export access control types for convenience (F-083)
export { TemplateAccessError } from './TemplateAccessControl';
export type { Role, PermissionLevel } from './TemplatePermissions';
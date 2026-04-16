/**
 * TemplateAccessControl — F-083
 * Enforces permissions on TemplateRegistry operations.
 *
 * wrap(registry, permissions) → proxied registry that checks
 * permissions before create/update/delete/read.
 * Maintains an audit log of access attempts (denied + granted).
 */

import type { TemplateRegistry } from './TemplateRegistry';
import type { TemplatePermissions, Role, PermissionCheckResult } from './TemplatePermissions';
import type { TemplateVersion } from './TemplateVersion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditEntry {
  timestamp: string;
  role: Role;
  operation: string;
  templateName: string;
  granted: boolean;
  reason?: string;
}

export class TemplateAccessError extends Error {
  constructor(
    public readonly role: Role,
    public readonly operation: string,
    public readonly templateName: string,
    public readonly reason: string,
  ) {
    super(`Access denied: role "${role}" cannot ${operation} template "${templateName}". ${reason}`);
    this.name = 'TemplateAccessError';
  }
}

// ---------------------------------------------------------------------------
// TemplateAccessControl class
// ---------------------------------------------------------------------------

export class TemplateAccessControl {
  private auditLog: AuditEntry[] = [];
  private readonly maxAuditLogSize: number;

  constructor(maxAuditLogSize = 1000) {
    this.maxAuditLogSize = maxAuditLogSize;
  }

  /**
   * Get a copy of the audit log.
   */
  getAuditLog(): AuditEntry[] {
    return [...this.auditLog];
  }

  /**
   * Flush the audit log: returns all entries and clears the array.
   */
  flushAuditLog(): AuditEntry[] {
    const entries = [...this.auditLog];
    this.auditLog = [];
    return entries;
  }

  /**
   * Clear the audit log.
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }

  /**
   * Record an audit entry.
   * Evicts oldest entries (FIFO) when the log exceeds maxAuditLogSize.
   */
  private audit(role: Role, operation: string, templateName: string, result: PermissionCheckResult): void {
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      role,
      operation,
      templateName,
      granted: result.allowed,
      reason: result.reason,
    });

    // FIFO eviction: drop oldest entries when over cap
    while (this.auditLog.length > this.maxAuditLogSize) {
      this.auditLog.shift();
    }
  }

  /**
   * Wrap a TemplateRegistry with permission enforcement.
   * Returns a proxied registry that checks permissions before
   * create (register), update (register on existing), delete
   * (removeVersion/removeTemplate), and read (get/getLatest/listVersions).
   *
   * Denied operations throw TemplateAccessError.
   */
  wrap(registry: TemplateRegistry, permissions: TemplatePermissions, role: Role): TemplateRegistry {
    const self = this;

    return new Proxy(registry, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);

        if (typeof value !== 'function') {
          return value;
        }

        const fn = value.bind(target);

        switch (prop) {
          // ---- Write operations ----
          case 'register': {
            return (name: string, version: TemplateVersion | string, content: string, metadata?: Record<string, unknown>) => {
              const isUpdate = target.has(name, version);
              const operation = isUpdate ? 'edit' : 'create';
              const result = operation === 'edit'
                ? permissions.canEdit(role, { name })
                : permissions.canCreate(role);

              self.audit(role, `register:${operation}`, name, result);

              if (!result.allowed) {
                throw new TemplateAccessError(role, `register:${operation}`, name, result.reason ?? 'Permission denied');
              }

              return fn(name, version, content, metadata);
            };
          }

          case 'removeVersion': {
            return (name: string, version: TemplateVersion | string) => {
              const result = permissions.canDelete(role, { name });
              self.audit(role, 'removeVersion', name, result);

              if (!result.allowed) {
                throw new TemplateAccessError(role, 'removeVersion', name, result.reason ?? 'Permission denied');
              }

              return fn(name, version);
            };
          }

          case 'removeTemplate': {
            return (name: string) => {
              const result = permissions.canDelete(role, { name });
              self.audit(role, 'removeTemplate', name, result);

              if (!result.allowed) {
                throw new TemplateAccessError(role, 'removeTemplate', name, result.reason ?? 'Permission denied');
              }

              return fn(name);
            };
          }

          // ---- Read operations ----
          case 'get': {
            return (name: string, version?: TemplateVersion | string) => {
              const result = permissions.canView(role, { name });
              self.audit(role, 'get', name, result);

              if (!result.allowed) {
                throw new TemplateAccessError(role, 'get', name, result.reason ?? 'Permission denied');
              }

              return fn(name, version);
            };
          }

          case 'getLatest': {
            return (name: string) => {
              const result = permissions.canView(role, { name });
              self.audit(role, 'getLatest', name, result);

              if (!result.allowed) {
                throw new TemplateAccessError(role, 'getLatest', name, result.reason ?? 'Permission denied');
              }

              return fn(name);
            };
          }

          case 'listVersions': {
            return (name: string) => {
              const result = permissions.canView(role, { name });
              self.audit(role, 'listVersions', name, result);

              if (!result.allowed) {
                throw new TemplateAccessError(role, 'listVersions', name, result.reason ?? 'Permission denied');
              }

              return fn(name);
            };
          }

          // ---- Unrestricted read operations (no template-specific context) ----
          case 'listTemplateNames':
          case 'has':
          case 'setCache':
          case 'getCache': {
            return fn;
          }

          default: {
            return fn;
          }
        }
      },
    });
  }
}

export default TemplateAccessControl;
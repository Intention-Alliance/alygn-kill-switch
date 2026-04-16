/**
 * TemplatePermissions — F-083
 * Role-based access control for template operations.
 *
 * Roles: admin, editor, viewer
 * Permission levels: full, edit, view, none
 */

import type { TemplateEntry } from './TemplateRegistry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Role = 'admin' | 'editor' | 'viewer';
export type PermissionLevel = 'full' | 'edit' | 'view' | 'none';

export interface PermissionCheckResult {
  allowed: boolean;
  level: PermissionLevel;
  reason?: string;
}

// ---------------------------------------------------------------------------
// TemplatePermissions class
// ---------------------------------------------------------------------------

export class TemplatePermissions {
  /**
   * Determine the permission level a role has for creating templates.
   * - admin: full (can create any template)
   * - editor: edit (can create templates)
   * - viewer: none (cannot create)
   */
  canCreate(role: Role): PermissionCheckResult {
    switch (role) {
      case 'admin':
        return { allowed: true, level: 'full' };
      case 'editor':
        return { allowed: true, level: 'edit' };
      case 'viewer':
        return { allowed: false, level: 'none', reason: 'Viewers cannot create templates' };
    }
  }

  /**
   * Determine the permission level a role has for editing a template.
   * - admin: full (can edit any template)
   * - editor: edit (can edit templates)
   * - viewer: none (cannot edit)
   */
  /**
   * Determine the permission level a role has for editing a template.
   * - admin: full (can edit any template)
   * - editor: edit (can edit templates)
   * - viewer: none (cannot edit)
   *
   * @param _template - Intentionally reserved for future per-template ACL.
   *   Currently unused but kept in the API signature so that callers can
   *   pass template context without breaking when granular template-level
   *   permissions are introduced later.
   */
  canEdit(role: Role, _template: TemplateEntry | { name: string }): PermissionCheckResult {
    switch (role) {
      case 'admin':
        return { allowed: true, level: 'full' };
      case 'editor':
        return { allowed: true, level: 'edit' };
      case 'viewer':
        return { allowed: false, level: 'none', reason: 'Viewers cannot edit templates' };
    }
  }

  /**
   * Determine the permission level a role has for deleting a template.
   * - admin: full (can delete any template)
   * - editor: none (cannot delete)
   * - viewer: none (cannot delete)
   */
  /**
   * Determine the permission level a role has for deleting a template.
   * - admin: full (can delete any template)
   * - editor: none (cannot delete)
   * - viewer: none (cannot delete)
   *
   * @param _template - Intentionally reserved for future per-template ACL.
   *   Currently unused but kept in the API signature so that callers can
   *   pass template context without breaking when granular template-level
   *   permissions are introduced later.
   */
  canDelete(role: Role, _template: TemplateEntry | { name: string }): PermissionCheckResult {
    switch (role) {
      case 'admin':
        return { allowed: true, level: 'full' };
      case 'editor':
        return { allowed: false, level: 'none', reason: 'Editors cannot delete templates' };
      case 'viewer':
        return { allowed: false, level: 'none', reason: 'Viewers cannot delete templates' };
    }
  }

  /**
   * Determine the permission level a role has for viewing a template.
   * - admin: full (can view any template)
   * - editor: view (can view templates)
   * - viewer: view (can view templates)
   */
  /**
   * Determine the permission level a role has for viewing a template.
   * - admin: full (can view any template)
   * - editor: view (can view templates)
   * - viewer: view (can view templates)
   *
   * @param _template - Intentionally reserved for future per-template ACL.
   *   Currently unused but kept in the API signature so that callers can
   *   pass template context without breaking when granular template-level
   *   permissions are introduced later.
   */
  canView(role: Role, _template: TemplateEntry | { name: string }): PermissionCheckResult {
    switch (role) {
      case 'admin':
        return { allowed: true, level: 'full' };
      case 'editor':
        return { allowed: true, level: 'view' };
      case 'viewer':
        return { allowed: true, level: 'view' };
    }
  }

  /**
   * Get the overall permission level for a role on a given operation.
   */
  getPermissionLevel(role: Role, operation: 'create' | 'edit' | 'delete' | 'view', template?: TemplateEntry | { name: string }): PermissionLevel {
    const tmpl = template ?? { name: '' };
    switch (operation) {
      case 'create':
        return this.canCreate(role).level;
      case 'edit':
        return this.canEdit(role, tmpl).level;
      case 'delete':
        return this.canDelete(role, tmpl).level;
      case 'view':
        return this.canView(role, tmpl).level;
    }
  }
}

export default TemplatePermissions;
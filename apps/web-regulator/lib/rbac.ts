/**
 * RBAC — Role-Based Access Control helpers (ADR-141, Phase 5).
 *
 * The dashboard authenticates via Better-Auth (see lib/auth-context.tsx).
 * The backend enforces role checks on write endpoints (e.g. settings writes
 * require `admin` and return 403 otherwise — see docs/architecture/settings-api.md §4.1).
 *
 * This module is the single source of truth for the *frontend* role model so
 * the UI can reflect the same permissions the backend enforces, without
 * duplicating role strings across components.
 */

import type { AuthUser } from "./auth-context";

/** Roles recognized by the dashboard. Mirrors the Better-Auth user.role. */
export type DashboardRole = AuthUser["role"];

/** Human-readable label for each role. */
export const ROLE_LABELS: Record<DashboardRole, string> = {
  admin: "Admin",
  sre: "SRE",
  developer: "Developer",
  viewer: "Viewer",
};

/** Ordered from most to least privileged — used for comparisons. */
const ROLE_RANK: Record<DashboardRole, number> = {
  admin: 4,
  sre: 3,
  developer: 2,
  viewer: 1,
};

/** Whether `role` is at least as privileged as `minimum`. */
export function hasRole(
  role: DashboardRole | undefined | null,
  minimum: DashboardRole,
): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/** Whether the user can write settings (backend requires `admin`). */
export function canWriteSettings(
  role: DashboardRole | undefined | null,
): boolean {
  return hasRole(role, "admin");
}

/** Whether the user can manage RBAC / roles (admin-only). */
export function canManageRbac(
  role: DashboardRole | undefined | null,
): boolean {
  return hasRole(role, "admin");
}

/** Whether the user can view the settings page at all (any authenticated role). */
export function canViewSettings(
  role: DashboardRole | undefined | null,
): boolean {
  return hasRole(role, "viewer");
}

/** Short description of what a role may do in the settings page. */
export function roleDescription(role: DashboardRole): string {
  switch (role) {
    case "admin":
      return "Full access — can modify all settings and manage roles.";
    case "sre":
      return "Read access — can view settings but not modify them.";
    case "developer":
      return "Read-only — can view settings for development context.";
    case "viewer":
      return "Read-only — can view settings.";
  }
}

import { STAFF_ROLES, type AccountStatus, type UserRole } from "@/lib/constants";

/**
 * Pure role and status rules, mirroring the SQL helpers (`has_role`, `is_staff`, `is_admin`,
 * `is_active_user`). The database remains the enforcer; these exist so the server can refuse
 * early with a clear error and so the proxy can route.
 */
export type AccessProfile = {
  status: AccountStatus;
  roles: readonly UserRole[];
};

/** Active or restricted (restricted accounts may use the product within their restrictions). */
export function isActiveStatus(status: AccountStatus): boolean {
  return status === "active" || status === "restricted";
}

export function hasRole(profile: AccessProfile, role: UserRole): boolean {
  return isActiveStatus(profile.status) && profile.roles.includes(role);
}

export function isStaff(profile: AccessProfile): boolean {
  return isActiveStatus(profile.status) && profile.roles.some((role) => (STAFF_ROLES as readonly UserRole[]).includes(role));
}

export function isAdmin(profile: AccessProfile): boolean {
  return hasRole(profile, "admin");
}

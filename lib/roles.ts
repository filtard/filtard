export const USER_ROLES = ["user", "curator", "admin", "super_admin"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ASSIGNABLE_ROLES = ["user", "curator", "admin"] as const;

export function isStaffRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

export function publishesImmediately(role: string | null | undefined): boolean {
  return role === "curator" || isStaffRole(role);
}

export function isVerifiedRole(role: string | null | undefined): boolean {
  return role === "curator" || isStaffRole(role);
}

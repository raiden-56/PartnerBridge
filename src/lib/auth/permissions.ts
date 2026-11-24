/**
 * Organization-level role & permission model.
 * MUST stay in sync with public.role_has_permission() in
 * supabase/migrations/20261123000002_functions.sql (the database enforces it via RLS).
 */
export type OrgRole = "owner" | "admin" | "partnership_manager" | "member";
export type PlatformRole = "user" | "moderator" | "super_admin";

export const PERMISSIONS = {
  "profile.manage": "Edit company profile, services and preferences",
  "team.manage": "Invite, remove and manage team members",
  "billing.manage": "Manage subscription and view invoices",
  "verification.manage": "Submit company verification",
  "opportunities.manage": "Create and manage partnership opportunities",
  "applications.manage": "Apply to opportunities and review applications",
  "requests.manage": "Send, accept and reject partnership requests",
  "workspaces.all": "Access every partnership workspace of the company",
  "analytics.view": "View partnership analytics and exports",
  "messages.direct": "Use direct company-to-company messaging",
  "ownership.transfer": "Transfer company ownership",
  "org.delete": "Delete the company",
} as const;

export type Permission = keyof typeof PERMISSIONS;

/** Permissions that can be granted individually to a "member" (or added to a partnership manager). */
export const GRANTABLE_PERMISSIONS: Permission[] = [
  "requests.manage",
  "applications.manage",
  "opportunities.manage",
  "workspaces.all",
  "analytics.view",
  "messages.direct",
  "profile.manage",
];

const MANAGER_DEFAULTS: Permission[] = [
  "requests.manage",
  "applications.manage",
  "workspaces.all",
  "analytics.view",
  "messages.direct",
];

export function roleHasPermission(role: OrgRole | null | undefined, grants: string[] | null | undefined, perm: Permission) {
  if (!role) return false;
  switch (role) {
    case "owner":
      return true;
    case "admin":
      return perm !== "ownership.transfer" && perm !== "org.delete";
    case "partnership_manager":
      return MANAGER_DEFAULTS.includes(perm) || (grants ?? []).includes(perm);
    default:
      return (grants ?? []).includes(perm);
  }
}

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  partnership_manager: "Partnership Manager",
  member: "Member",
};

export const ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  owner: "Full control including billing, ownership transfer and deletion.",
  admin: "Manage company profile, opportunities, team, verification and billing.",
  partnership_manager: "Handle requests, applications and every partnership workspace.",
  member: "Access only the workspaces and permissions explicitly assigned.",
};

/** Roles an actor is allowed to assign. Only owners can create admins. */
export function assignableRoles(actor: OrgRole): OrgRole[] {
  if (actor === "owner") return ["admin", "partnership_manager", "member"];
  if (actor === "admin") return ["partnership_manager", "member"];
  return [];
}

export function isPlatformStaff(role?: PlatformRole | null) {
  return role === "super_admin" || role === "moderator";
}

/** Admin modules moderators may use (they never get private partnership documents). */
export const MODERATOR_MODULES = new Set([
  "dashboard",
  "companies",
  "verification",
  "opportunities",
  "requests",
  "reports",
  "featured",
]);

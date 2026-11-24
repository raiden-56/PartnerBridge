import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { roleHasPermission, isPlatformStaff, type OrgRole, type Permission } from "@/lib/auth/permissions";
import type { Membership, Profile } from "@/types/db";

export class AuthError extends Error {
  constructor(
    message: string,
    public status: 401 | 403 | 404 = 403,
  ) {
    super(message);
  }
}

export const getUser = cache(async () => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return (data as Profile) ?? null;
});

export const getMemberships = cache(async (): Promise<Membership[]> => {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select(
      "id, organization_id, user_id, role, permissions, joined_at, organization:organizations(id, name, slug, logo_url, verification_status, profile_status, onboarding_step, is_demo)",
    )
    .eq("user_id", user.id)
    .order("joined_at");
  return (data ?? []) as unknown as Membership[];
});

export interface OrgContext {
  userId: string;
  profile: Profile;
  memberships: Membership[];
  membership: Membership;
  orgId: string;
  role: OrgRole;
  can: (perm: Permission) => boolean;
}

/** Resolve the user's active organization (falls back to the first membership). */
export const getOrgContext = cache(async (): Promise<OrgContext | null> => {
  const [profile, memberships] = await Promise.all([getProfile(), getMemberships()]);
  if (!profile || memberships.length === 0) return null;
  const membership =
    memberships.find((m) => m.organization_id === profile.active_organization_id) ?? memberships[0]!;
  return {
    userId: profile.id,
    profile,
    memberships,
    membership,
    orgId: membership.organization_id,
    role: membership.role,
    can: (perm) => roleHasPermission(membership.role, membership.permissions, perm),
  };
});

/** For pages: redirect to login / onboarding when the context is missing. */
export async function requireUserPage(next?: string) {
  const user = await getUser();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  const profile = await getProfile();
  if (profile?.is_suspended) redirect("/login?error=suspended");
  return { user, profile: profile! };
}

export async function requireOrgPage(perm?: Permission) {
  await requireUserPage();
  const ctx = await getOrgContext();
  if (!ctx) redirect("/onboarding");
  if (perm && !ctx.can(perm)) redirect("/dashboard?denied=" + perm);
  return ctx;
}

/** For server actions / route handlers: throw instead of redirecting. */
export async function requireUser() {
  const user = await getUser();
  if (!user) throw new AuthError("You must be signed in", 401);
  const profile = await getProfile();
  if (!profile || profile.is_suspended) throw new AuthError("Account unavailable", 403);
  return { user, profile };
}

export async function requireOrg(perm?: Permission, orgId?: string) {
  await requireUser();
  const ctx = await getOrgContext();
  if (!ctx) throw new AuthError("Create or join a company first", 403);
  if (orgId && orgId !== ctx.orgId) {
    // Acting on behalf of a non-active organization: verify membership explicitly.
    const m = ctx.memberships.find((x) => x.organization_id === orgId);
    if (!m) throw new AuthError("You are not a member of this company", 403);
    const scoped: OrgContext = {
      ...ctx,
      membership: m,
      orgId: m.organization_id,
      role: m.role,
      can: (p) => roleHasPermission(m.role, m.permissions, p),
    };
    if (perm && !scoped.can(perm)) throw new AuthError("You do not have permission to do that", 403);
    return scoped;
  }
  if (perm && !ctx.can(perm)) throw new AuthError("You do not have permission to do that", 403);
  return ctx;
}

export async function requireStaff(superAdminOnly = false) {
  const { profile } = await requireUser();
  if (superAdminOnly ? profile.platform_role !== "super_admin" : !isPlatformStaff(profile.platform_role)) {
    throw new AuthError("Platform administrator access required", 403);
  }
  return profile;
}

/** Verify the current user may enter a partnership workspace (uses the DB helper so rules match RLS). */
export async function requirePartnershipAccess(partnershipId: string) {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const { data: ok } = await supabase.rpc("can_access_partnership", { p_partnership: partnershipId });
  if (!ok) throw new AuthError("You do not have access to this partnership", 404);
  const { data: partnership } = await supabase.from("partnerships").select("*").eq("id", partnershipId).single();
  if (!partnership) throw new AuthError("Partnership not found", 404);
  const mySide = ctx.memberships.find((m) =>
    [partnership.organization_a_id, partnership.organization_b_id].includes(m.organization_id),
  );
  if (!mySide) throw new AuthError("You do not have access to this partnership", 404);
  const otherOrgId =
    partnership.organization_a_id === mySide.organization_id ? partnership.organization_b_id : partnership.organization_a_id;
  return { ctx, partnership, myOrgId: mySide.organization_id as string, otherOrgId: otherOrgId as string };
}

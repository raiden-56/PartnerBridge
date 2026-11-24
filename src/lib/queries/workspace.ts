import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireOrgPage, requirePartnershipAccess, AuthError } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

type OrgLite = { id: string; name: string; slug: string; logo_url: string | null; verification_status: "verified" | "pending" | "not_submitted" | "rejected" | "info_required"; city: string | null; country: string | null };

/** Resolve workspace context for pages; unauthorized users get a 404 (no existence leak). */
export const getWorkspace = cache(async (id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  await requireOrgPage();
  try {
    const access = await requirePartnershipAccess(id);
    const supabase = await createClient();
    const [{ data: orgs }, { data: category }, { data: members }] = await Promise.all([
      supabase.from("organizations").select("id, name, slug, logo_url, verification_status, city, country").in("id", [access.partnership.organization_a_id, access.partnership.organization_b_id]),
      access.partnership.category_id ? supabase.from("partnership_categories").select("name").eq("id", access.partnership.category_id).single() : Promise.resolve({ data: null }),
      supabase
        .from("organization_members")
        .select("user_id, organization_id, role, permissions, profile:profiles!organization_members_user_id_fkey(id, full_name, avatar_url, designation, email)")
        .in("organization_id", [access.partnership.organization_a_id, access.partnership.organization_b_id]),
    ]);
    const me = (orgs ?? []).find((o) => o.id === access.myOrgId) as OrgLite;
    const other = (orgs ?? []).find((o) => o.id === access.otherOrgId) as OrgLite;
    const people = (members ?? []).map((m) => {
      const p = m.profile as unknown as { id: string; full_name: string | null; avatar_url: string | null; designation: string | null; email: string };
      return { id: m.user_id as string, orgId: m.organization_id as string, role: m.role as string, name: p?.full_name ?? p?.email ?? "Member", avatar: p?.avatar_url ?? null, designation: p?.designation ?? null, email: p?.email ?? "" };
    });
    return { ...access, me, other, categoryName: (category as { name: string } | null)?.name ?? null, people };
  } catch (e) {
    if (e instanceof AuthError) notFound();
    throw e;
  }
});

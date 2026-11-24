import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Category, Industry } from "@/types/db";

export const getIndustries = cache(async (): Promise<Industry[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("industries").select("id, parent_id, name, slug, is_active, sort_order").eq("is_active", true).order("sort_order").order("name");
  return (data ?? []) as Industry[];
});

export const getCategories = cache(async (): Promise<Category[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("partnership_categories").select("*").eq("is_active", true).order("sort_order");
  return (data ?? []) as Category[];
});

/** Full editable company record (members only — RLS enforces). */
export async function getEditableCompany(orgId: string) {
  const supabase = await createClient();
  const [{ data: org }, { data: contacts }, { data: services }, { data: prefs }, { data: verification }] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", orgId).maybeSingle(),
    supabase.from("organization_contacts").select("*").eq("organization_id", orgId).maybeSingle(),
    supabase.from("company_services").select("*").eq("organization_id", orgId).order("sort_order"),
    supabase.from("company_partnership_preferences").select("*").eq("organization_id", orgId),
    supabase
      .from("organization_verifications")
      .select("id, status, reviewer_notes, submitted_at, reviewed_at, registration_number, domain, domain_verification_token, domain_verified_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return { org, contacts, services: services ?? [], prefs: prefs ?? [], verification };
}

export const getPublicPlans = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscription_plans")
    .select("id, code, name, tagline, price_monthly, price_yearly, is_custom_pricing, trial_days, features, limits, sort_order")
    .eq("is_active", true)
    .eq("is_public", true)
    .order("sort_order");
  return (data ?? []).map((p) => ({ ...p, price_monthly: Number(p.price_monthly), price_yearly: Number(p.price_yearly) }));
});

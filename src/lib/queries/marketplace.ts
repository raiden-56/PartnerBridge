import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { getCategories } from "./reference";
import type { Category, Opportunity, Organization } from "@/types/db";

export const ORG_CARD_SELECT =
  "id, slug, name, logo_url, website, company_size, city, state, country, short_description, verification_status, is_featured, is_demo, open_to_partnership, year_established, created_at, capabilities, " +
  "industry:industries!organizations_industry_id_fkey(id, name, slug), " +
  "prefs:company_partnership_preferences(direction, category_id)";

export type OrgCard = Pick<
  Organization,
  | "id"
  | "slug"
  | "name"
  | "logo_url"
  | "website"
  | "company_size"
  | "city"
  | "state"
  | "country"
  | "short_description"
  | "verification_status"
  | "is_featured"
  | "is_demo"
  | "open_to_partnership"
  | "year_established"
  | "created_at"
  | "capabilities"
> & {
  industry: { id: string; name: string; slug: string } | null;
  prefs: { direction: "offered" | "wanted"; category_id: string }[];
};

export interface DiscoveryParams {
  q?: string;
  industry?: string[];
  country?: string;
  state?: string;
  city?: string;
  size?: string[];
  foundedFrom?: number;
  foundedTo?: number;
  verified?: boolean;
  offered?: string[]; // category ids or slugs
  wanted?: string[];
  capabilities?: string[];
  markets?: string[];
  open?: boolean;
  sort?: "relevance" | "recent" | "active" | "verified";
  page?: number;
  perPage?: number;
  excludeOrgId?: string;
}

function resolveCategoryIds(values: string[] | undefined, categories: Category[]) {
  if (!values?.length) return null;
  const ids = values
    .map((v) => categories.find((c) => c.id === v || c.slug === v)?.id)
    .filter(Boolean) as string[];
  return ids.length ? ids : null;
}

export async function searchCompanies(params: DiscoveryParams) {
  if (!isSupabaseConfigured()) return { items: [] as OrgCard[], total: 0 };
  const supabase = await createClient();
  const categories = await getCategories();
  const perPage = Math.min(params.perPage ?? 12, 48);
  const page = Math.max(1, params.page ?? 1);

  const { data: hits, error } = await supabase.rpc("search_organizations", {
    p_query: params.q || null,
    p_industry_ids: params.industry?.length ? params.industry : null,
    p_country: params.country || null,
    p_state: params.state || null,
    p_city: params.city || null,
    p_sizes: params.size?.length ? params.size : null,
    p_founded_from: params.foundedFrom ?? null,
    p_founded_to: params.foundedTo ?? null,
    p_verified_only: !!params.verified,
    p_offered: resolveCategoryIds(params.offered, categories),
    p_wanted: resolveCategoryIds(params.wanted, categories),
    p_capabilities: params.capabilities?.length ? params.capabilities : null,
    p_markets: params.markets?.length ? params.markets : null,
    p_open_only: !!params.open,
    p_exclude_org: params.excludeOrgId ?? null,
    p_sort: params.sort ?? "relevance",
    p_limit: perPage,
    p_offset: (page - 1) * perPage,
  });
  if (error) {
    console.error("[search]", error);
    return { items: [], total: 0 };
  }
  const rows = (hits ?? []) as { id: string; total_count: number }[];
  if (!rows.length) return { items: [], total: 0 };
  const { data } = await supabase.from("organizations").select(ORG_CARD_SELECT).in("id", rows.map((r) => r.id));
  const byId = new Map(((data ?? []) as unknown as OrgCard[]).map((o) => [o.id, o]));
  return { items: rows.map((r) => byId.get(r.id)).filter(Boolean) as OrgCard[], total: Number(rows[0]!.total_count) };
}

export async function getFeaturedCompanies(limit = 6) {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select(ORG_CARD_SELECT)
    .eq("profile_status", "published")
    .is("deleted_at", null)
    .order("is_featured", { ascending: false })
    .order("verification_status", { ascending: true })
    .order("activity_score", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as OrgCard[];
}

export const OPP_SELECT =
  "id, organization_id, category_id, title, description, required_capabilities, target_locations, expected_partner_size, commercial_model, duration, deadline, visibility, status, accepting_applications, application_count, is_demo, published_at, created_at, " +
  "organization:organizations(id, name, slug, logo_url, verification_status, city, country), category:partnership_categories(id, name, slug)";

export interface OpportunityFilters {
  q?: string;
  category?: string;
  location?: string;
  verified?: boolean;
  page?: number;
  perPage?: number;
}

export async function listOpportunities(f: OpportunityFilters = {}) {
  if (!isSupabaseConfigured()) return { items: [] as Opportunity[], total: 0 };
  const supabase = await createClient();
  const perPage = Math.min(f.perPage ?? 12, 48);
  const page = Math.max(1, f.page ?? 1);
  let query = supabase
    .from("partnership_opportunities")
    .select(OPP_SELECT, { count: "exact" })
    .eq("status", "published")
    .is("deleted_at", null)
    .order("published_at", { ascending: false });
  if (f.q) {
    const term = f.q.replace(/[%,()*\\]/g, " ").trim().slice(0, 80);
    if (term) query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
  }
  if (f.category) {
    const cats = await getCategories();
    const id = cats.find((c) => c.slug === f.category || c.id === f.category)?.id;
    if (id) query = query.eq("category_id", id);
  }
  if (f.location) query = query.contains("target_locations", [f.location]);
  const { data, count, error } = await query.range((page - 1) * perPage, page * perPage - 1);
  if (error) console.error("[opportunities]", error);
  let items = (data ?? []) as unknown as Opportunity[];
  if (f.verified) items = items.filter((o) => o.organization?.verification_status === "verified");
  return { items, total: count ?? 0 };
}

export async function getPublicStats() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("platform_public_stats");
  return data as {
    companies: number;
    verified_companies: number;
    open_opportunities: number;
    partnerships: number;
    industries: number;
    countries: number;
    demo_companies: number;
  } | null;
}

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformSetting } from "@/lib/settings";
import { DEFAULT_WEIGHTS, rankMatches, type MatchProfile, type MatchWeights, type MatchResult } from "./engine";

type Row = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  company_size: string | null;
  capabilities: string[];
  target_markets: string[];
  locations_served: string[];
  partnership_goals: string[];
  short_description: string | null;
  industry: { slug: string; parent: { slug: string } | null } | null;
  sub_industry: { slug: string } | null;
  prefs: { direction: "offered" | "wanted"; category: { slug: string } | null }[];
  services: { name: string; description: string | null }[];
};

const SELECT =
  "id, name, city, state, country, company_size, capabilities, target_markets, locations_served, partnership_goals, short_description, " +
  "industry:industries!organizations_industry_id_fkey(slug, parent:industries!parent_id(slug)), " +
  "sub_industry:industries!organizations_sub_industry_id_fkey(slug), " +
  "prefs:company_partnership_preferences(direction, category:partnership_categories(slug)), " +
  "services:company_services(name, description)";

function toProfile(r: Row): MatchProfile {
  const parent = r.industry?.parent?.slug ?? r.industry?.slug ?? null;
  return {
    id: r.id,
    name: r.name,
    industrySlug: r.industry?.slug ?? null,
    parentIndustrySlug: parent,
    subIndustrySlug: r.sub_industry?.slug ?? null,
    country: r.country,
    state: r.state,
    city: r.city,
    companySize: r.company_size,
    capabilities: r.capabilities ?? [],
    targetMarkets: r.target_markets ?? [],
    locationsServed: r.locations_served ?? [],
    goals: r.partnership_goals ?? [],
    offered: r.prefs.filter((p) => p.direction === "offered" && p.category).map((p) => p.category!.slug),
    wanted: r.prefs.filter((p) => p.direction === "wanted" && p.category).map((p) => p.category!.slug),
    serviceText: [r.short_description ?? "", ...r.services.map((s) => `${s.name} ${s.description ?? ""}`)].join(" ").toLowerCase(),
  };
}

/** Compute (and cache) recommendations for an organization using only public profile data. */
export async function computeRecommendations(orgId: string, limit: number): Promise<MatchResult[]> {
  const admin = createAdminClient();
  const weights = await getPlatformSetting<Partial<MatchWeights>>("matching_weights", DEFAULT_WEIGHTS);

  const [{ data: meRow }, { data: candidates }, { data: blocks }, { data: dismissed }, { data: partners }] = await Promise.all([
    admin.from("organizations").select(SELECT).eq("id", orgId).single(),
    admin.from("organizations").select(SELECT).eq("profile_status", "published").is("deleted_at", null).neq("id", orgId).limit(1000),
    admin.from("organization_blocks").select("blocked_organization_id").eq("organization_id", orgId),
    admin.from("partner_recommendations").select("recommended_organization_id").eq("organization_id", orgId).eq("dismissed", true),
    admin.from("partnerships").select("organization_a_id, organization_b_id").or(`organization_a_id.eq.${orgId},organization_b_id.eq.${orgId}`).neq("status", "ended"),
  ]);
  if (!meRow) return [];

  const excluded = new Set<string>([
    ...(blocks ?? []).map((b) => b.blocked_organization_id as string),
    ...(dismissed ?? []).map((d) => d.recommended_organization_id as string),
    ...(partners ?? []).flatMap((p) => [p.organization_a_id as string, p.organization_b_id as string]),
  ]);

  const me = toProfile(meRow as unknown as Row);
  const pool = ((candidates ?? []) as unknown as Row[]).filter((c) => !excluded.has(c.id)).map(toProfile);
  const ranked = rankMatches(me, pool, weights).slice(0, Math.max(limit, 0) || 50);

  if (ranked.length) {
    await admin.from("partner_recommendations").upsert(
      ranked.map((r) => ({
        organization_id: orgId,
        recommended_organization_id: r.organizationId,
        score: r.score,
        breakdown: { ...r.breakdown, matching_types: r.matchingTypes, shared: r.sharedInterests },
        reasons: r.reasons,
        suggested_collaborations: r.suggestedCollaborations,
        computed_at: new Date().toISOString(),
      })),
      { onConflict: "organization_id,recommended_organization_id", ignoreDuplicates: false },
    );
  }
  return ranked;
}

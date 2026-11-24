import type { Metadata } from "next";
import Link from "next/link";
import { Info, Lightbulb, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, Progress } from "@/components/ui/primitives";
import { CompanyLogo, DemoBadge, EmptyState, PageHeader, VerificationBadge } from "@/components/shared/common";
import { MatchActions } from "@/components/company/match-actions";
import { requireOrgPage } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { computeRecommendations } from "@/lib/matching/recommendations";
import { getEntitlement } from "@/lib/billing/entitlements";
import { limitValue } from "@/lib/billing/limits";
import { titleCase } from "@/lib/utils";

export const metadata: Metadata = { title: "Smart matches" };

const LABELS: Record<string, string> = {
  partnership_type: "Partnership type fit",
  complementary_services: "Complementary services",
  industry: "Industry",
  objectives: "Shared goals",
  geography: "Geography",
  target_market: "Target market",
  company_size: "Company size",
  capabilities: "Capabilities",
};

export default async function MatchesPage() {
  const ctx = await requireOrgPage();
  const supabase = await createClient();
  const ent = await getEntitlement(ctx.orgId);
  const limit = limitValue(ent.limits, "recommendations");
  const shown = limit < 0 ? 100 : limit;

  const fetchCached = () =>
    supabase
      .from("partner_recommendations")
      .select("score, breakdown, reasons, suggested_collaborations, computed_at, org:organizations!partner_recommendations_recommended_organization_id_fkey(id, name, slug, logo_url, verification_status, short_description, city, country, is_demo, open_to_partnership, industry:industries!organizations_industry_id_fkey(name))")
      .eq("organization_id", ctx.orgId)
      .eq("dismissed", false)
      .order("score", { ascending: false })
      .limit(shown);

  let { data: recs } = await fetchCached();
  const { data: org } = await supabase.from("organizations").select("profile_status").eq("id", ctx.orgId).single();
  if ((!recs || recs.length === 0) && org?.profile_status === "published") {
    await computeRecommendations(ctx.orgId, shown);
    ({ data: recs } = await fetchCached());
  }

  return (
    <>
      <PageHeader
        title="Smart partner matches"
        description="Transparent, rule-based recommendations. Every score is the sum of the factors shown — nothing is hidden."
        actions={<MatchActions />}
      />
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          Scores compare your partnership types offered/wanted, complementary industries, goals, geography, company size, target markets and capabilities. Weights are set by
          PartnerBridge administrators. Your plan ({ent.planName}) shows up to {limit < 0 ? "unlimited" : limit} recommendations.
          {limit >= 0 && limit < 25 && (
            <>
              {" "}
              <Link href="/dashboard/billing" className="font-medium underline">
                Upgrade for more
              </Link>
              .
            </>
          )}
        </p>
      </div>

      {org?.profile_status !== "published" ? (
        <EmptyState icon={Sparkles} title="Publish your profile to get matches" description="Recommendations use your published profile data." action={<Button asChild><Link href="/onboarding?step=7">Finish profile</Link></Button>} />
      ) : !recs || recs.length === 0 ? (
        <EmptyState icon={Sparkles} title="No strong matches yet" description="Add more partnership types, capabilities and target markets to your profile to improve matching." action={<Button asChild variant="outline"><Link href="/dashboard/company">Improve profile</Link></Button>} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {recs.map((r) => {
            const o = r.org as unknown as {
              id: string;
              name: string;
              slug: string;
              logo_url: string | null;
              verification_status: "verified";
              short_description: string | null;
              city: string | null;
              country: string | null;
              is_demo: boolean;
              open_to_partnership: boolean;
              industry: { name: string } | null;
            };
            const b = r.breakdown as Record<string, number | string[]>;
            const types = (b.matching_types as string[]) ?? [];
            const shared = (b.shared as string[]) ?? [];
            const score = Math.round(Number(r.score));
            return (
              <Card key={o.id} className="overflow-hidden">
                <CardContent className="space-y-4 pt-5">
                  <div className="flex items-start gap-3">
                    <CompanyLogo name={o.name} src={o.logo_url} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/companies/${o.slug}`} className="flex items-center gap-1.5 font-semibold text-slate-900 hover:text-accent">
                        {o.name} <VerificationBadge status={o.verification_status} compact showUnverified={false} />
                      </Link>
                      <p className="text-xs text-slate-500">
                        {o.industry?.name} · {[o.city, o.country].filter(Boolean).join(", ")}
                      </p>
                      {o.is_demo && <DemoBadge className="mt-1" />}
                    </div>
                    <div className="relative flex size-16 shrink-0 items-center justify-center">
                      <svg viewBox="0 0 36 36" className="absolute size-full -rotate-90">
                        <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                        <circle cx="18" cy="18" r="15.5" fill="none" stroke="#2563eb" strokeWidth="3" strokeDasharray={`${(score / 100) * 97.4} 97.4`} strokeLinecap="round" />
                      </svg>
                      <span className="font-display text-base font-bold text-slate-900">{score}%</span>
                    </div>
                  </div>
                  <p className="line-clamp-2 text-sm text-slate-600">{o.short_description}</p>

                  {types.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-slate-500">Matching types:</span>
                      {types.map((t) => (
                        <Badge key={t} variant="accent">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Why this company</p>
                    <ul className="space-y-1 text-sm text-slate-700">
                      {(r.reasons as string[]).map((reason) => (
                        <li key={reason}>✓ {reason}</li>
                      ))}
                    </ul>
                  </div>

                  {shared.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-xs font-medium text-slate-500">Shared interests:</span>
                      {shared.map((s) => (
                        <Badge key={s} variant="muted">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {(r.suggested_collaborations as string[]).length > 0 && (
                    <div className="rounded-lg bg-amber-50/70 p-3">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                        <Lightbulb className="size-3.5" /> Suggested collaborations
                      </p>
                      <ul className="space-y-0.5 text-sm text-amber-900">
                        {(r.suggested_collaborations as string[]).map((s) => (
                          <li key={s}>• {s}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <details className="group text-sm">
                    <summary className="cursor-pointer text-xs font-medium text-accent">Show score breakdown</summary>
                    <div className="mt-3 space-y-2">
                      {Object.entries(LABELS).map(([k, label]) => {
                        const v = Number(b[k] ?? 0);
                        return (
                          <div key={k} className="grid grid-cols-[150px_1fr_40px] items-center gap-2 text-xs">
                            <span className="text-slate-600">{label}</span>
                            <Progress value={Math.min(100, (v / 25) * 100)} className="h-1.5" />
                            <span className="text-right tabular-nums text-slate-700">+{v}</span>
                          </div>
                        );
                      })}
                    </div>
                  </details>

                  <div className="flex items-center gap-2 border-t border-border pt-4">
                    {o.open_to_partnership && (
                      <Button asChild size="sm" variant="accent">
                        <Link href={`/dashboard/requests/new?to=${o.slug}`}>
                          <Send /> Send request
                        </Link>
                      </Button>
                    )}
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/companies/${o.slug}`}>View profile</Link>
                    </Button>
                    <MatchActions dismissId={o.id} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <p className="mt-6 text-center text-xs text-muted-foreground">Factors: {Object.values(LABELS).map(titleCase).join(" · ")}</p>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase, Building2, CalendarDays, Globe, Handshake, Mail, MapPin, Phone, Target, Users, Package, Wrench } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { CompanyLogo, DemoBadge, VerificationBadge } from "@/components/shared/common";
import { ProfileActions } from "@/components/company/profile-actions";
import { CompanyCard } from "@/components/company/company-card";
import { OpportunityCard } from "@/components/opportunities/opportunity-card";
import { FadeIn } from "@/components/shared/motion";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgContext, getUser } from "@/lib/auth/session";
import { getCategories } from "@/lib/queries/reference";
import { ORG_CARD_SELECT, OPP_SELECT, type OrgCard } from "@/lib/queries/marketplace";
import { titleCase, websiteHost } from "@/lib/utils";
import type { Opportunity, Organization } from "@/types/db";

async function loadCompany(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("*, industry:industries!organizations_industry_id_fkey(id, name, slug), sub_industry:industries!organizations_sub_industry_id_fkey(id, name, slug)")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  return data as Organization | null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const org = await loadCompany(slug);
  if (!org) return { title: "Company not found" };
  return { title: org.name, description: org.short_description ?? undefined, openGraph: { images: org.logo_url ? [org.logo_url] : [] } };
}

export default async function CompanyProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await loadCompany(slug);
  if (!org) notFound();

  const supabase = await createClient();
  const [user, ctx, categories] = await Promise.all([getUser(), getOrgContext(), getCategories()]);
  const isMember = !!ctx?.memberships.some((m) => m.organization_id === org.id);
  if (org.profile_status !== "published" && !isMember) notFound();

  const [{ data: services }, { data: prefs }, { data: opps }, { data: contact }, { data: similar }, { count: partnershipCount }] = await Promise.all([
    supabase.from("company_services").select("id, kind, name, description").eq("organization_id", org.id).order("sort_order"),
    supabase.from("company_partnership_preferences").select("category_id, direction").eq("organization_id", org.id),
    supabase.from("partnership_opportunities").select(OPP_SELECT).eq("organization_id", org.id).eq("status", "published").is("deleted_at", null).order("published_at", { ascending: false }).limit(4),
    supabase.rpc("get_org_contact", { p_org: org.id }).maybeSingle(),
    org.industry_id
      ? supabase.from("organizations").select(ORG_CARD_SELECT).eq("industry_id", org.industry_id).eq("profile_status", "published").neq("id", org.id).is("deleted_at", null).limit(3)
      : Promise.resolve({ data: [] }),
    // Aggregate count only (no partner identities) — shown when the company allows public activity.
    createAdminClient()
      .from("partnerships")
      .select("id", { count: "exact", head: true })
      .or(`organization_a_id.eq.${org.id},organization_b_id.eq.${org.id}`)
      .neq("status", "ended"),
  ]);

  let saved = false;
  let blocked = false;
  if (ctx && !isMember) {
    const [{ data: s }, { data: b }] = await Promise.all([
      supabase.from("company_saved").select("saved_organization_id").eq("organization_id", ctx.orgId).eq("saved_organization_id", org.id).maybeSingle(),
      supabase.from("organization_blocks").select("blocked_organization_id").eq("organization_id", ctx.orgId).eq("blocked_organization_id", org.id).maybeSingle(),
    ]);
    saved = !!s;
    blocked = !!b;
  }

  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "";
  const offered = (prefs ?? []).filter((p) => p.direction === "offered").map((p) => catName(p.category_id));
  const wanted = (prefs ?? []).filter((p) => p.direction === "wanted").map((p) => catName(p.category_id));
  const c = contact as { email: string | null; phone: string | null; address: string | null } | null;
  const location = [org.city, org.state, org.country].filter(Boolean).join(", ");

  return (
    <div className="pb-16">
      {/* Cover */}
      <div className="relative h-44 overflow-hidden bg-gradient-to-br from-navy-900 via-blue-900 to-accent sm:h-60">
        {org.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={org.cover_url} alt="" className="size-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-grid opacity-20" />
        )}
      </div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <FadeIn className="relative -mt-14 flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-lift)] md:flex-row md:items-end md:justify-between">
          <div className="flex gap-5">
            <CompanyLogo name={org.name} src={org.logo_url} className="size-20 border-4 border-white text-2xl shadow-md" />
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{org.name}</h1>
                <VerificationBadge status={org.verification_status} />
                {org.is_demo && <DemoBadge />}
                {org.profile_status !== "published" && <Badge variant="warning">Draft — only your team can see this</Badge>}
              </div>
              <p className="max-w-2xl text-slate-600">{org.short_description}</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-500">
                {org.industry && (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="size-4" /> {org.industry.name}
                    {org.sub_industry && ` · ${org.sub_industry.name}`}
                  </span>
                )}
                {location && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-4" /> {location}
                  </span>
                )}
                {org.company_size && (
                  <span className="flex items-center gap-1.5">
                    <Users className="size-4" /> {org.company_size} employees
                  </span>
                )}
                {org.year_established && (
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="size-4" /> Est. {org.year_established}
                  </span>
                )}
              </div>
            </div>
          </div>
          <ProfileActions
            org={{ id: org.id, slug: org.slug, name: org.name, open_to_partnership: org.open_to_partnership }}
            signedIn={!!user}
            saved={saved}
            isOwnCompany={isMember}
            canMessage={!!ctx?.can("messages.direct")}
            blocked={blocked}
          />
        </FadeIn>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>About {org.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{org.overview ?? "No overview provided yet."}</p>
                {org.mission && (
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mission & capabilities</p>
                    <p className="mt-1.5 whitespace-pre-line text-sm text-slate-700">{org.mission}</p>
                  </div>
                )}
                {org.target_customers && (
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                      <Target className="size-4 text-accent" /> Target customers
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{org.target_customers}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {(services ?? []).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Products & services</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {(services ?? []).map((s) => (
                    <div key={s.id} className="flex gap-3 rounded-xl border border-border p-4">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-accent">
                        {s.kind === "product" ? <Package className="size-4" /> : <Wrench className="size-4" />}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                        {s.description && <p className="mt-0.5 text-xs text-slate-600">{s.description}</p>}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {(opps ?? []).length > 0 && (
              <div>
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <Briefcase className="size-5 text-accent" /> Partnership opportunities
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {((opps ?? []) as unknown as Opportunity[]).map((o) => (
                    <OpportunityCard key={o.id} opp={o} />
                  ))}
                </div>
              </div>
            )}

            {(similar ?? []).length > 0 && (
              <div>
                <h2 className="mb-4 text-lg font-semibold text-slate-900">Similar companies</h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {((similar ?? []) as unknown as OrgCard[]).map((o) => (
                    <CompanyCard key={o.id} org={o} categories={categories} signedIn={!!user} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Handshake className="size-4 text-accent" /> Partnership interests
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Looking for</p>
                  <div className="flex flex-wrap gap-1.5">{wanted.length ? wanted.map((w) => <Badge key={w} variant="outline">{w}</Badge>) : <span className="text-sm text-muted-foreground">—</span>}</div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Offers</p>
                  <div className="flex flex-wrap gap-1.5">{offered.length ? offered.map((w) => <Badge key={w} variant="accent">{w}</Badge>) : <span className="text-sm text-muted-foreground">—</span>}</div>
                </div>
                {org.partnership_goals.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Goals</p>
                    <ul className="space-y-1 text-sm text-slate-700">
                      {org.partnership_goals.map((g) => (
                        <li key={g}>• {titleCase(g)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{org.open_to_partnership ? "✅ Currently open to new partnership requests" : "⏸ Not accepting new requests right now"}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Company details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {org.website && (
                  <a href={org.website} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-2 text-accent hover:underline">
                    <Globe className="size-4" /> {websiteHost(org.website)}
                  </a>
                )}
                {c?.email && (
                  <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-slate-700 hover:text-accent">
                    <Mail className="size-4" /> {c.email}
                  </a>
                )}
                {c?.phone && (
                  <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-slate-700 hover:text-accent">
                    <Phone className="size-4" /> {c.phone}
                  </a>
                )}
                {c?.address && (
                  <p className="flex items-start gap-2 text-slate-700">
                    <MapPin className="mt-0.5 size-4 shrink-0" /> {c.address}
                  </p>
                )}
                {!c?.email && !c?.phone && <p className="text-xs text-muted-foreground">Contact details are private. Send a request or message to get in touch.</p>}
                {Object.entries(org.social_links ?? {}).length > 0 && (
                  <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                    {Object.entries(org.social_links).map(([k, v]) => (
                      <a key={k} href={v} target="_blank" rel="noopener noreferrer nofollow" className="rounded-md border border-border px-2 py-1 text-xs capitalize text-slate-600 hover:bg-secondary">
                        {k}
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {(org.capabilities.length > 0 || org.locations_served.length > 0 || org.industries_served.length > 0 || org.target_markets.length > 0) && (
              <Card>
                <CardContent className="space-y-4 pt-5">
                  {[
                    ["Capabilities", org.capabilities],
                    ["Industries served", org.industries_served],
                    ["Target markets", org.target_markets],
                    ["Locations served", org.locations_served],
                  ].map(([label, items]) =>
                    (items as string[]).length ? (
                      <div key={label as string}>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{label as string}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(items as string[]).map((i) => (
                            <Badge key={i} variant="muted">
                              {i}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null,
                  )}
                </CardContent>
              </Card>
            )}

            {org.privacy?.show_activity !== false && (
              <Card>
                <CardContent className="grid grid-cols-2 gap-4 pt-5 text-center">
                  <div>
                    <p className="font-display text-2xl font-bold text-slate-900">{partnershipCount ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Active partnerships</p>
                  </div>
                  <div>
                    <p className="font-display text-2xl font-bold text-slate-900">{(opps ?? []).length}</p>
                    <p className="text-xs text-muted-foreground">Open opportunities</p>
                  </div>
                  <p className="col-span-2 text-xs text-muted-foreground">
                    Member since {new Date(org.created_at).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
                  </p>
                </CardContent>
              </Card>
            )}
            <p className="text-center text-xs text-muted-foreground">
              <Link href="/companies" className="hover:text-accent">
                ← Back to all companies
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

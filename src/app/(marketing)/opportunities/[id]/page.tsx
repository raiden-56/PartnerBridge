import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Clock, Coins, Flag, Gift, ListChecks, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { CompanyLogo, DemoBadge, StatusBadge, VerificationBadge } from "@/components/shared/common";
import { ApplyForm } from "@/components/opportunities/apply-form";
import { ReportDialog } from "@/components/company/profile-actions";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext, getUser } from "@/lib/auth/session";
import { getIndustries } from "@/lib/queries/reference";
import { OPP_SELECT } from "@/lib/queries/marketplace";
import { formatDate, timeAgo } from "@/lib/utils";
import type { Opportunity } from "@/types/db";

const UUID = /^[0-9a-f-]{36}$/i;

async function load(id: string) {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("partnership_opportunities").select(`${OPP_SELECT}, requirements, benefits, preferred_industry_ids`).eq("id", id).is("deleted_at", null).maybeSingle();
  return data as unknown as (Opportunity & { requirements: string | null; benefits: string | null }) | null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const opp = await load((await params).id);
  return { title: opp?.title ?? "Opportunity", description: opp?.description.slice(0, 160) };
}

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const opp = await load(id);
  if (!opp) notFound();
  const [user, ctx, industries] = await Promise.all([getUser(), getOrgContext(), getIndustries()]);
  const isOwner = ctx?.orgId === opp.organization_id;

  let myApplication: { id: string; status: string; created_at: string } | null = null;
  if (ctx && !isOwner) {
    const supabase = await createClient();
    const { data } = await supabase.from("opportunity_applications").select("id, status, created_at").eq("opportunity_id", opp.id).eq("applicant_organization_id", ctx.orgId).maybeSingle();
    myApplication = data;
  }
  const preferred = industries.filter((i) => opp.preferred_industry_ids.includes(i.id));
  const expired = opp.deadline ? new Date(opp.deadline) < new Date(new Date().toDateString()) : false;
  const open = opp.status === "published" && opp.accepting_applications && !expired;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link href="/opportunities" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900">
        <ArrowLeft className="size-4" /> All opportunities
      </Link>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {opp.category && <Badge variant="accent">{opp.category.name}</Badge>}
              {opp.status !== "published" && <StatusBadge status={opp.status} />}
              {opp.is_demo && <DemoBadge />}
              {opp.visibility === "verified_only" && <Badge variant="success">Verified applicants only</Badge>}
            </div>
            <h1 className="mt-3 text-3xl font-bold text-slate-900">{opp.title}</h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-500">
              <span className="flex items-center gap-1.5">
                <Clock className="size-4" /> Posted {timeAgo(opp.published_at ?? opp.created_at)}
              </span>
              {opp.deadline && (
                <span className="flex items-center gap-1.5">
                  <CalendarClock className="size-4" /> Apply by {formatDate(opp.deadline)}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Users className="size-4" /> {opp.application_count} applications
              </span>
            </div>
          </div>
          <Card>
            <CardContent className="pt-5">
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{opp.description}</p>
            </CardContent>
          </Card>
          <div className="grid gap-4 sm:grid-cols-2">
            {opp.requirements && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <ListChecks className="size-4 text-accent" /> Requirements
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-line text-sm text-slate-700">{opp.requirements}</p>
                </CardContent>
              </Card>
            )}
            {opp.benefits && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Gift className="size-4 text-accent" /> Benefits for partners
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-line text-sm text-slate-700">{opp.benefits}</p>
                </CardContent>
              </Card>
            )}
          </div>
          <Card>
            <CardContent className="grid gap-5 pt-5 sm:grid-cols-2">
              {[
                ["Required capabilities", opp.required_capabilities],
                ["Target locations", opp.target_locations],
                ["Preferred industries", preferred.map((p) => p.name)],
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
              {opp.expected_partner_size && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Expected partner size</p>
                  <p className="text-sm text-slate-700">{opp.expected_partner_size} employees</p>
                </div>
              )}
              {opp.commercial_model && (
                <div>
                  <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Coins className="size-3.5" /> Commercial model
                  </p>
                  <p className="text-sm text-slate-700">{opp.commercial_model}</p>
                </div>
              )}
              {opp.duration && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Duration</p>
                  <p className="text-sm text-slate-700">{opp.duration}</p>
                </div>
              )}
            </CardContent>
          </Card>
          {user && !isOwner && (
            <ReportDialog
              targetType="opportunity"
              targetId={opp.id}
              trigger={
                <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive">
                  <Flag className="size-3.5" /> Report this opportunity
                </button>
              }
            />
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {opp.organization && (
            <Card>
              <CardContent className="flex items-center gap-3 pt-5">
                <CompanyLogo name={opp.organization.name} src={opp.organization.logo_url} />
                <div className="min-w-0">
                  <Link href={`/companies/${opp.organization.slug}`} className="block truncate font-semibold text-slate-900 hover:text-accent">
                    {opp.organization.name}
                  </Link>
                  <p className="flex items-center gap-1 text-xs text-slate-500">
                    <MapPin className="size-3" /> {[opp.organization.city, opp.organization.country].filter(Boolean).join(", ")}
                  </p>
                  <div className="mt-1">
                    <VerificationBadge status={opp.organization.verification_status} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>{isOwner ? "Your opportunity" : myApplication ? "Your application" : "Apply now"}</CardTitle>
            </CardHeader>
            <CardContent>
              {isOwner ? (
                <Button asChild className="w-full">
                  <Link href={`/dashboard/opportunities/${opp.id}`}>Manage & review applications</Link>
                </Button>
              ) : myApplication ? (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <StatusBadge status={myApplication.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">Submitted {timeAgo(myApplication.created_at)}</p>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/dashboard/applications">View my applications</Link>
                  </Button>
                </div>
              ) : !open ? (
                <p className="text-sm text-muted-foreground">{expired ? "The application deadline has passed." : "This opportunity is not accepting applications right now."}</p>
              ) : !user ? (
                <Button asChild variant="accent" className="w-full">
                  <Link href={`/login?next=/opportunities/${opp.id}`}>Sign in to apply</Link>
                </Button>
              ) : !ctx ? (
                <Button asChild variant="accent" className="w-full">
                  <Link href="/onboarding">Create your company to apply</Link>
                </Button>
              ) : !ctx.can("applications.manage") ? (
                <p className="text-sm text-muted-foreground">Your role can&apos;t submit applications. Ask a company admin.</p>
              ) : (
                <ApplyForm opportunityId={opp.id} />
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

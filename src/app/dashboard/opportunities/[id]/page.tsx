import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Handshake, Users } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { CompanyLogo, EmptyState, PageHeader, StatusBadge, VerificationBadge } from "@/components/shared/common";
import { OpportunityForm } from "@/components/opportunities/opportunity-form";
import { ApplicationReviewControls, OpportunityStatusControls } from "@/components/opportunities/manage-opportunity";
import { AttachmentLink } from "@/components/requests/request-actions";
import { requireOrgPage } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getCategories, getIndustries } from "@/lib/queries/reference";
import { timeAgo } from "@/lib/utils";
import type { ApplicationStatus, FileRef, Opportunity } from "@/types/db";

export const metadata: Metadata = { title: "Manage opportunity" };

export default async function ManageOpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireOrgPage();
  const supabase = await createClient();
  const { data: opp } = await supabase.from("partnership_opportunities").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!opp || opp.organization_id !== ctx.orgId) notFound();

  const canManage = ctx.can("opportunities.manage");
  const canReview = ctx.can("applications.manage");
  const [categories, industries, { data: apps }] = await Promise.all([
    getCategories(),
    getIndustries(),
    canReview
      ? supabase
          .from("opportunity_applications")
          .select("id, proposal, capabilities, attachments, status, owner_notes, created_at, partnership_id, applicant:organizations!opportunity_applications_applicant_organization_id_fkey(id, name, slug, logo_url, verification_status, city, country, short_description)")
          .eq("opportunity_id", id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const groups: Record<string, number> = {};
  (apps ?? []).forEach((a) => (groups[a.status] = (groups[a.status] ?? 0) + 1));

  return (
    <>
      <Link href="/dashboard/opportunities" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900">
        <ArrowLeft className="size-4" /> My opportunities
      </Link>
      <PageHeader
        title={opp.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={opp.status} /> {!opp.accepting_applications && <Badge variant="warning">Applications paused</Badge>}
            <span>{opp.application_count} applications</span>
          </span>
        }
        actions={canManage && <OpportunityStatusControls id={opp.id} status={opp.status} accepting={opp.accepting_applications} />}
      />
      <Tabs defaultValue={canReview ? "applications" : "details"}>
        <TabsList>
          {canReview && (
            <TabsTrigger value="applications">
              <Users className="size-4" /> Applications ({(apps ?? []).length})
            </TabsTrigger>
          )}
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        {canReview && (
          <TabsContent value="applications" className="space-y-4">
            {Object.keys(groups).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(groups).map(([s, n]) => (
                  <span key={s} className="flex items-center gap-1.5 text-xs">
                    <StatusBadge status={s} /> {n}
                  </span>
                ))}
              </div>
            )}
            {(apps ?? []).length === 0 ? (
              <EmptyState icon={Users} title="No applications yet" description={opp.status === "published" ? "Share your opportunity to attract applicants." : "Publish this opportunity to start receiving applications."} />
            ) : (
              (apps ?? []).map((a) => {
                const org = a.applicant as unknown as { id: string; name: string; slug: string; logo_url: string | null; verification_status: "verified"; city: string | null; country: string | null; short_description: string | null };
                return (
                  <Card key={a.id}>
                    <CardContent className="grid gap-5 pt-5 lg:grid-cols-[1fr_320px]">
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <CompanyLogo name={org.name} src={org.logo_url} />
                          <div className="min-w-0 flex-1">
                            <Link href={`/companies/${org.slug}`} className="flex items-center gap-1 font-semibold text-slate-900 hover:text-accent">
                              {org.name} <VerificationBadge status={org.verification_status} compact showUnverified={false} />
                            </Link>
                            <p className="text-xs text-slate-500">
                              {[org.city, org.country].filter(Boolean).join(", ")} · applied {timeAgo(a.created_at)}
                            </p>
                          </div>
                          <StatusBadge status={a.status} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Proposal</p>
                          <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{a.proposal}</p>
                        </div>
                        {a.capabilities && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Capabilities</p>
                            <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{a.capabilities}</p>
                          </div>
                        )}
                        {(a.attachments as FileRef[]).length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {(a.attachments as FileRef[]).map((f) => (
                              <AttachmentLink key={f.path} kind="application" requestId={a.id} path={f.path} name={f.name} />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="rounded-xl bg-slate-50 p-4">
                        {a.status === "accepted" && a.partnership_id ? (
                          <Link href={`/dashboard/partnerships/${a.partnership_id}`} className="flex items-center gap-2 text-sm font-medium text-success hover:underline">
                            <Handshake className="size-4" /> Partnership created — open workspace
                          </Link>
                        ) : a.status === "withdrawn" ? (
                          <p className="text-sm text-muted-foreground">The applicant withdrew this application.</p>
                        ) : (
                          <ApplicationReviewControls id={a.id} status={a.status as ApplicationStatus} notes={a.owner_notes} />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>
        )}
        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>{canManage ? "Edit opportunity" : "Opportunity details"}</CardTitle>
            </CardHeader>
            <CardContent>
              {canManage ? (
                <OpportunityForm opportunity={opp as Opportunity & { requirements: string | null; benefits: string | null }} categories={categories} industries={industries} />
              ) : (
                <p className="whitespace-pre-line text-sm text-slate-700">{opp.description}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { FileStack, Handshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/primitives";
import { CompanyLogo, EmptyState, PageHeader, StatusBadge } from "@/components/shared/common";
import { WithdrawApplicationButton } from "@/components/opportunities/withdraw-button";
import { requireOrgPage } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "My applications" };

export default async function MyApplicationsPage() {
  const ctx = await requireOrgPage();
  const supabase = await createClient();
  const { data } = await supabase
    .from("opportunity_applications")
    .select("id, status, proposal, created_at, status_changed_at, partnership_id, opportunity:partnership_opportunities(id, title, deadline, status, organization:organizations(name, slug, logo_url))")
    .eq("applicant_organization_id", ctx.orgId)
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader
        title="My applications"
        description="Track applications your company submitted to partnership opportunities."
        actions={
          <Button asChild variant="outline">
            <Link href="/opportunities">Browse opportunities</Link>
          </Button>
        }
      />
      {(data ?? []).length === 0 ? (
        <EmptyState icon={FileStack} title="No applications yet" description="Find opportunities that fit your business and apply with a tailored proposal." action={<Button asChild><Link href="/opportunities">Browse opportunities</Link></Button>} />
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((a) => {
            const opp = a.opportunity as unknown as { id: string; title: string; deadline: string | null; status: string; organization: { name: string; slug: string; logo_url: string | null } };
            return (
              <Card key={a.id}>
                <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center">
                  <CompanyLogo name={opp.organization.name} src={opp.organization.logo_url} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/opportunities/${opp.id}`} className="font-semibold text-slate-900 hover:text-accent">
                      {opp.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {opp.organization.name} · applied {formatDate(a.created_at)} · updated {timeAgo(a.status_changed_at)}
                    </p>
                    <p className="mt-1 line-clamp-1 text-sm text-slate-600">{a.proposal}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={a.status} />
                    {a.status === "accepted" && a.partnership_id && (
                      <Button asChild size="sm" variant="accent">
                        <Link href={`/dashboard/partnerships/${a.partnership_id}`}>
                          <Handshake /> Workspace
                        </Link>
                      </Button>
                    )}
                    {ctx.can("applications.manage") && ["submitted", "under_review", "shortlisted", "discussion"].includes(a.status) && <WithdrawApplicationButton id={a.id} />}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

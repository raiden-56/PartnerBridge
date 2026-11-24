import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Table, TBody, TD, TH, THead, TR, Badge } from "@/components/ui/primitives";
import { EmptyState, PageHeader, StatusBadge } from "@/components/shared/common";
import { requireOrgPage } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getEntitlement, getUsage } from "@/lib/billing/entitlements";
import { limitValue } from "@/lib/billing/limits";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "My opportunities" };

export default async function MyOpportunitiesPage() {
  const ctx = await requireOrgPage();
  const supabase = await createClient();
  const { data } = await supabase
    .from("partnership_opportunities")
    .select("id, title, status, deadline, application_count, accepting_applications, published_at, created_at, category:partnership_categories(name)")
    .eq("organization_id", ctx.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const [ent, used] = await Promise.all([getEntitlement(ctx.orgId), getUsage(ctx.orgId, "active_opportunities")]);
  const limit = limitValue(ent.limits, "active_opportunities");
  const canManage = ctx.can("opportunities.manage");

  return (
    <>
      <PageHeader
        title="My opportunities"
        description={`Opportunities your company has posted. ${limit < 0 ? "Unlimited active opportunities" : `${used} of ${limit} active opportunities used`} on the ${ent.planName} plan.`}
        actions={
          canManage && (
            <Button asChild variant="accent">
              <Link href="/dashboard/opportunities/new">
                <Plus /> Post opportunity
              </Link>
            </Button>
          )
        }
      />
      {(data ?? []).length === 0 ? (
        <EmptyState icon={Briefcase} title="No opportunities yet" description="Publish what you're looking for and let partners come to you." action={canManage && <Button asChild><Link href="/dashboard/opportunities/new">Post your first opportunity</Link></Button>} />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Opportunity</TH>
                <TH>Status</TH>
                <TH className="hidden md:table-cell">Deadline</TH>
                <TH className="text-right">Applications</TH>
              </TR>
            </THead>
            <TBody>
              {(data ?? []).map((o) => (
                <TR key={o.id}>
                  <TD>
                    <Link href={`/dashboard/opportunities/${o.id}`} className="font-medium text-slate-900 hover:text-accent">
                      {o.title}
                    </Link>
                    <p className="text-xs text-slate-500">{(o.category as unknown as { name: string } | null)?.name} · created {formatDate(o.created_at)}</p>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge status={o.status} />
                      {o.status === "published" && !o.accepting_applications && <Badge variant="warning">Applications paused</Badge>}
                    </div>
                  </TD>
                  <TD className="hidden md:table-cell">{formatDate(o.deadline)}</TD>
                  <TD className="text-right font-semibold tabular-nums">{o.application_count}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}

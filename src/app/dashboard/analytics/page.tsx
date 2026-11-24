import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, BadgeCheck, Briefcase, Clock, Flag, Handshake, Inbox, Lock, Share2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { PageHeader, StatCard, StatusBadge } from "@/components/shared/common";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { DealPipeline, Engagement, MonthlyReferrals, PartnershipsOverTime, RequestsVsAcceptances, TypeDistribution } from "@/components/analytics/charts";
import { requireOrgPage } from "@/lib/auth/session";
import { computeAnalytics, parseFilters } from "@/lib/analytics/queries";
import { hasFeature } from "@/lib/billing/entitlements";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireOrgPage("analytics.view");
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const [data, advanced, exportsAllowed] = await Promise.all([computeAnalytics(ctx.orgId, filters), hasFeature(ctx.orgId, "advanced_analytics"), hasFeature(ctx.orgId, "exports")]);
  const k = data.kpis;

  return (
    <>
      <PageHeader title="Partnership analytics" description="All figures are calculated live from your company's requests, partnerships, deals and activity." />
      <AnalyticsFilters
        from={format(filters.from, "yyyy-MM-dd")}
        to={format(filters.to, "yyyy-MM-dd")}
        categories={data.categories}
        partners={data.partnerOptions}
        exportsAllowed={exportsAllowed}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total requests" value={k.totalRequests} icon={Inbox} hint={`${k.acceptanceRate}% acceptance on decided`} />
        <StatCard label="Incoming" value={k.incomingRequests} icon={ArrowDownLeft} tone="violet" />
        <StatCard label="Outgoing" value={k.outgoingRequests} icon={ArrowUpRight} tone="violet" />
        <StatCard label="Active partnerships" value={k.activePartnerships} icon={Handshake} tone="green" />
        <StatCard label="Pending approvals" value={k.pendingApprovals} icon={Clock} tone="amber" />
        <StatCard label="Active opportunities" value={k.activeOpportunities} icon={Briefcase} />
        <StatCard label="Deals generated" value={k.dealsGenerated} icon={TrendingUp} />
        <StatCard label="Referrals received" value={k.referralsReceived} icon={Share2} tone="violet" hint={`${k.referralsSent} sent`} />
        <StatCard label="Completed milestones" value={k.completedMilestones} icon={Flag} tone="green" />
        <StatCard label="Est. pipeline value" value={formatCurrency(k.estimatedPipeline, "INR", true)} icon={TrendingUp} tone="amber" />
      </div>

      <Card className="mt-4">
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-3">
          {[
            { label: "Estimated opportunity value", value: k.estimatedPipeline, hint: "Expected value of open deals — a forecast, not revenue.", tone: "text-amber-600" },
            { label: "Attributed revenue", value: k.attributedRevenue, hint: "Revenue claimed by deal owners on won deals (self-reported).", tone: "text-violet-600" },
            { label: "Verified revenue", value: k.verifiedRevenue, hint: "Revenue confirmed by the partner company.", tone: "text-success", icon: true },
          ].map((r) => (
            <div key={r.label}>
              <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {r.label} {r.icon && <BadgeCheck className="size-3.5 text-success" />}
              </p>
              <p className={`mt-1 font-display text-2xl font-bold tabular-nums ${r.tone}`}>{formatCurrency(r.value)}</p>
              <p className="text-xs text-muted-foreground">{r.hint}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <PartnershipsOverTime data={data.charts.partnershipsOverTime} />
        <RequestsVsAcceptances data={data.charts.requestsVsAcceptances} />
        {advanced ? (
          <>
            <TypeDistribution data={data.charts.typeDistribution} />
            <MonthlyReferrals data={data.charts.monthlyReferrals} />
            <DealPipeline data={data.charts.pipeline} />
            <Engagement data={data.charts.engagement} />
          </>
        ) : (
          <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center lg:col-span-2">
            <Lock className="size-6 text-slate-400" />
            <p className="font-semibold text-slate-900">Advanced analytics</p>
            <p className="max-w-md text-sm text-muted-foreground">Partnership type distribution, referral trends, deal pipeline, engagement and partner performance are available on Growth and above.</p>
            <Button asChild variant="accent">
              <Link href="/dashboard/billing">Upgrade plan</Link>
            </Button>
          </Card>
        )}
      </div>

      {advanced && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Partnership performance</CardTitle>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Partner</TH>
                <TH className="hidden sm:table-cell">Type</TH>
                <TH>Status</TH>
                <TH className="text-right">Deals</TH>
                <TH className="hidden text-right md:table-cell">Pipeline (est.)</TH>
                <TH className="hidden text-right md:table-cell">Attributed</TH>
                <TH className="text-right">Verified</TH>
                <TH className="hidden text-right lg:table-cell">Tasks done</TH>
                <TH className="hidden text-right lg:table-cell">Milestones</TH>
              </TR>
            </THead>
            <TBody>
              {data.performance.length === 0 && (
                <TR>
                  <TD colSpan={9} className="py-8 text-center text-muted-foreground">
                    No partnerships match these filters.
                  </TD>
                </TR>
              )}
              {data.performance.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <Link href={`/dashboard/partnerships/${p.id}`} className="font-medium text-slate-900 hover:text-accent">
                      {p.partner}
                    </Link>
                  </TD>
                  <TD className="hidden sm:table-cell">{p.category}</TD>
                  <TD>
                    <StatusBadge status={p.status} />
                  </TD>
                  <TD className="text-right tabular-nums">{p.deals}</TD>
                  <TD className="hidden text-right tabular-nums md:table-cell">{formatCurrency(p.pipeline)}</TD>
                  <TD className="hidden text-right tabular-nums md:table-cell">{formatCurrency(p.attributed)}</TD>
                  <TD className="text-right font-medium tabular-nums text-success">{formatCurrency(p.verified)}</TD>
                  <TD className="hidden text-right tabular-nums lg:table-cell">{p.taskCompletion}%</TD>
                  <TD className="hidden text-right tabular-nums lg:table-cell">{p.milestonesDone}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}

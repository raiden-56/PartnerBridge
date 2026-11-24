import "server-only";
import { eachMonthOfInterval, format, startOfMonth, subMonths } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AnalyticsFilters {
  from: Date;
  to: Date;
  categoryId?: string | null;
  partnerOrgId?: string | null;
  status?: string | null;
}

export function parseFilters(sp: Record<string, string | undefined>): AnalyticsFilters {
  const to = sp.to && !Number.isNaN(Date.parse(sp.to)) ? new Date(sp.to + "T23:59:59") : new Date();
  const from = sp.from && !Number.isNaN(Date.parse(sp.from)) ? new Date(sp.from) : startOfMonth(subMonths(to, 11));
  return { from, to, categoryId: sp.category || null, partnerOrgId: sp.partner || null, status: sp.status || null };
}

const monthKey = (d: string | Date) => format(new Date(d), "yyyy-MM");

/**
 * Computes analytics for one organization from real database rows only.
 * Called after an explicit `analytics.view` permission check; uses the service
 * client but every query is scoped to the caller's organization id.
 */
export async function computeAnalytics(orgId: string, f: AnalyticsFilters) {
  const admin = createAdminClient();
  const fromIso = f.from.toISOString();
  const toIso = f.to.toISOString();
  const orFilter = `organization_a_id.eq.${orgId},organization_b_id.eq.${orgId}`;

  let partnershipsQ = admin
    .from("partnerships")
    .select("id, title, status, started_at, category_id, organization_a_id, organization_b_id, category:partnership_categories(name), a:organizations!partnerships_organization_a_id_fkey(name), b:organizations!partnerships_organization_b_id_fkey(name)")
    .or(orFilter);
  if (f.categoryId) partnershipsQ = partnershipsQ.eq("category_id", f.categoryId);
  if (f.status) partnershipsQ = partnershipsQ.eq("status", f.status);

  let requestsQ = admin
    .from("partnership_requests")
    .select("id, status, sent_at, responded_at, sender_organization_id, receiver_organization_id, category_id")
    .or(`sender_organization_id.eq.${orgId},receiver_organization_id.eq.${orgId}`)
    .neq("status", "draft")
    .gte("sent_at", fromIso)
    .lte("sent_at", toIso);
  if (f.categoryId) requestsQ = requestsQ.eq("category_id", f.categoryId);

  const [{ data: partnershipsRaw }, { data: requests }, { count: activeOpps }, { data: activity }, { data: categories }] = await Promise.all([
    partnershipsQ,
    requestsQ,
    admin.from("partnership_opportunities").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "published").is("deleted_at", null),
    admin.from("activity_logs").select("created_at").eq("organization_id", orgId).gte("created_at", fromIso).lte("created_at", toIso).limit(5000),
    admin.from("partnership_categories").select("id, name"),
  ]);

  const partnerships = (partnershipsRaw ?? [])
    .map((p) => {
      const otherId = p.organization_a_id === orgId ? p.organization_b_id : p.organization_a_id;
      const otherName = ((p.organization_a_id === orgId ? p.b : p.a) as unknown as { name: string })?.name ?? "Partner";
      return { ...p, otherId, otherName, categoryName: (p.category as unknown as { name: string } | null)?.name ?? "Other" };
    })
    .filter((p) => !f.partnerOrgId || p.otherId === f.partnerOrgId);
  const pIds = partnerships.map((p) => p.id);

  const [{ data: deals }, { data: referrals }, { data: milestones }, { data: tasks }] = pIds.length
    ? await Promise.all([
        admin.from("partnership_deals").select("id, partnership_id, title, stage, expected_value, attributed_revenue, verified_revenue, created_at, closed_at, owner_organization_id, referral_source_organization_id").in("partnership_id", pIds).is("deleted_at", null),
        admin.from("referrals").select("id, partnership_id, from_organization_id, to_organization_id, status, created_at").in("partnership_id", pIds).gte("created_at", fromIso).lte("created_at", toIso),
        admin.from("partnership_milestones").select("id, partnership_id, status, completed_at").in("partnership_id", pIds).is("deleted_at", null),
        admin.from("partnership_tasks").select("id, partnership_id, status").in("partnership_id", pIds).is("deleted_at", null),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const reqs = requests ?? [];
  const incoming = reqs.filter((r) => r.receiver_organization_id === orgId);
  const outgoing = reqs.filter((r) => r.sender_organization_id === orgId);
  const accepted = reqs.filter((r) => r.status === "accepted");
  const pending = incoming.filter((r) => ["sent", "viewed", "negotiation"].includes(r.status));
  const allDeals = deals ?? [];
  const openDeals = allDeals.filter((d) => !["won", "lost"].includes(d.stage));
  const wonDeals = allDeals.filter((d) => d.stage === "won");
  const sum = (arr: typeof allDeals, k: "expected_value" | "attributed_revenue" | "verified_revenue") => arr.reduce((s, d) => s + Number(d[k] ?? 0), 0);

  const kpis = {
    totalRequests: reqs.length,
    incomingRequests: incoming.length,
    outgoingRequests: outgoing.length,
    activePartnerships: partnerships.filter((p) => p.status === "active").length,
    pendingApprovals: pending.length,
    activeOpportunities: activeOpps ?? 0,
    dealsGenerated: allDeals.filter((d) => new Date(d.created_at) >= f.from && new Date(d.created_at) <= f.to).length,
    referralsReceived: (referrals ?? []).filter((r) => r.to_organization_id === orgId).length,
    referralsSent: (referrals ?? []).filter((r) => r.from_organization_id === orgId).length,
    estimatedPipeline: sum(openDeals, "expected_value"),
    attributedRevenue: sum(wonDeals, "attributed_revenue"),
    verifiedRevenue: sum(wonDeals, "verified_revenue"),
    completedMilestones: (milestones ?? []).filter((m) => m.status === "completed" && m.completed_at && new Date(m.completed_at) >= f.from && new Date(m.completed_at) <= f.to).length,
    acceptanceRate: reqs.length ? Math.round((accepted.length / reqs.filter((r) => !["sent", "viewed", "negotiation"].includes(r.status)).length || 0) * 100) : 0,
  };

  const months = eachMonthOfInterval({ start: f.from, end: f.to }).map((d) => format(d, "yyyy-MM"));
  const label = (m: string) => format(new Date(m + "-01"), "MMM yy");
  const count = <T,>(rows: T[], getDate: (r: T) => string | null | undefined, m: string) => rows.filter((r) => getDate(r) && monthKey(getDate(r)!) === m).length;

  const partnershipsOverTime = months.map((m) => ({
    month: label(m),
    new: count(partnerships, (p) => p.started_at, m),
    total: partnerships.filter((p) => monthKey(p.started_at) <= m).length,
  }));
  const requestsVsAcceptances = months.map((m) => ({
    month: label(m),
    sent: count(outgoing, (r) => r.sent_at, m),
    received: count(incoming, (r) => r.sent_at, m),
    accepted: count(accepted, (r) => r.responded_at, m),
  }));
  const monthlyReferrals = months.map((m) => ({
    month: label(m),
    received: count((referrals ?? []).filter((r) => r.to_organization_id === orgId), (r) => r.created_at, m),
    sent: count((referrals ?? []).filter((r) => r.from_organization_id === orgId), (r) => r.created_at, m),
  }));
  const engagement = months.map((m) => ({ month: label(m), actions: count(activity ?? [], (a) => a.created_at, m) }));

  const typeMap = new Map<string, number>();
  partnerships.forEach((p) => typeMap.set(p.categoryName, (typeMap.get(p.categoryName) ?? 0) + 1));
  const typeDistribution = Array.from(typeMap, ([name, value]) => ({ name, value }));

  const pipeline = ["lead", "qualified", "proposal", "negotiation", "won", "lost"].map((stage) => {
    const ds = allDeals.filter((d) => d.stage === stage);
    return { stage: stage[0]!.toUpperCase() + stage.slice(1), count: ds.length, value: ds.reduce((s, d) => s + Number(d.expected_value), 0) };
  });

  const performance = partnerships.map((p) => {
    const pd = allDeals.filter((d) => d.partnership_id === p.id);
    const pt = (tasks ?? []).filter((t) => t.partnership_id === p.id);
    const pm = (milestones ?? []).filter((m) => m.partnership_id === p.id);
    return {
      id: p.id,
      partner: p.otherName,
      partnerId: p.otherId,
      category: p.categoryName,
      status: p.status,
      startedAt: p.started_at,
      deals: pd.length,
      pipeline: pd.filter((d) => !["won", "lost"].includes(d.stage)).reduce((s, d) => s + Number(d.expected_value), 0),
      won: pd.filter((d) => d.stage === "won").length,
      attributed: pd.filter((d) => d.stage === "won").reduce((s, d) => s + Number(d.attributed_revenue ?? 0), 0),
      verified: pd.filter((d) => d.stage === "won").reduce((s, d) => s + Number(d.verified_revenue ?? 0), 0),
      taskCompletion: pt.length ? Math.round((pt.filter((t) => t.status === "done").length / pt.length) * 100) : 0,
      milestonesDone: `${pm.filter((m) => m.status === "completed").length}/${pm.length}`,
    };
  });

  return {
    kpis,
    charts: { partnershipsOverTime, requestsVsAcceptances, monthlyReferrals, engagement, typeDistribution, pipeline },
    performance,
    deals: allDeals,
    partnerOptions: Array.from(new Map((partnershipsRaw ?? []).map((p) => {
      const otherId = p.organization_a_id === orgId ? p.organization_b_id : p.organization_a_id;
      const otherName = ((p.organization_a_id === orgId ? p.b : p.a) as unknown as { name: string })?.name ?? "Partner";
      return [otherId, otherName] as const;
    }))).map(([id, name]) => ({ id, name })),
    categories: (categories ?? []) as { id: string; name: string }[],
  };
}

export type AnalyticsResult = Awaited<ReturnType<typeof computeAnalytics>>;

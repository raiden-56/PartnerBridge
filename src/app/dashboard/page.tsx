import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Briefcase, CalendarClock, CheckSquare, Handshake, Inbox, PartyPopper, Rocket, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Progress } from "@/components/ui/primitives";
import { CompanyLogo, EmptyState, PageHeader, StatCard, StatusBadge, VerificationBadge } from "@/components/shared/common";
import { requireOrgPage } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string; denied?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireOrgPage();
  const supabase = await createClient();
  const orgId = ctx.orgId;
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: org }, { count: incoming }, { count: outgoing }, { data: partnerships }, { count: openOpps }, { data: activity }, { data: recs }] = await Promise.all([
    supabase.from("organizations").select("name, profile_status, verification_status, onboarding_step, short_description, logo_url, overview").eq("id", orgId).single(),
    supabase.from("partnership_requests").select("id", { count: "exact", head: true }).eq("receiver_organization_id", orgId).in("status", ["sent", "viewed", "negotiation"]),
    supabase.from("partnership_requests").select("id", { count: "exact", head: true }).eq("sender_organization_id", orgId).in("status", ["sent", "viewed", "negotiation"]),
    supabase
      .from("partnerships")
      .select("id, title, status, started_at, organization_a_id, organization_b_id, a:organizations!partnerships_organization_a_id_fkey(name, slug, logo_url), b:organizations!partnerships_organization_b_id_fkey(name, slug, logo_url)")
      .or(`organization_a_id.eq.${orgId},organization_b_id.eq.${orgId}`)
      .eq("status", "active")
      .order("started_at", { ascending: false }),
    supabase.from("partnership_opportunities").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "published").is("deleted_at", null),
    supabase.from("activity_logs").select("id, summary, created_at, action, partnership_id").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(8),
    supabase
      .from("partner_recommendations")
      .select("score, reasons, org:organizations!partner_recommendations_recommended_organization_id_fkey(id, name, slug, logo_url, verification_status)")
      .eq("organization_id", orgId)
      .eq("dismissed", false)
      .order("score", { ascending: false })
      .limit(3),
  ]);

  const pIds = (partnerships ?? []).map((p) => p.id);
  const [{ data: milestones }, { data: tasks }, { data: deals }] = pIds.length
    ? await Promise.all([
        supabase.from("partnership_milestones").select("id, title, target_date, progress, status, partnership_id").in("partnership_id", pIds).neq("status", "completed").is("deleted_at", null).gte("target_date", today).order("target_date").limit(5),
        supabase
          .from("partnership_tasks")
          .select("id, title, due_date, priority, status, partnership_id")
          .in("partnership_id", pIds)
          .neq("status", "done")
          .is("deleted_at", null)
          .or(`assignee_id.eq.${ctx.userId},responsible_organization_id.eq.${orgId}`)
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(6),
        supabase.from("partnership_deals").select("expected_value, stage").in("partnership_id", pIds).is("deleted_at", null),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const pipeline = (deals ?? []).filter((d) => !["won", "lost"].includes(d.stage)).reduce((s, d) => s + Number(d.expected_value), 0);
  const partnerOf = (p: { organization_a_id: string; a: unknown; b: unknown }) => {
    const other = p.organization_a_id === orgId ? p.b : p.a;
    return other as unknown as { name: string; slug: string; logo_url: string | null };
  };
  const ptitle = (id: string) => (partnerships ?? []).find((p) => p.id === id)?.title ?? "";

  const checklist = [
    { done: !!ctx.profile.designation, label: "Complete your personal profile", href: "/onboarding?step=1" },
    { done: !!org?.overview, label: "Describe your company and services", href: "/dashboard/company" },
    { done: org?.profile_status === "published", label: "Publish your company profile", href: "/onboarding?step=7" },
    { done: org?.verification_status === "verified" || org?.verification_status === "pending", label: "Submit verification documents", href: "/dashboard/company/verification" },
    { done: (outgoing ?? 0) + (partnerships?.length ?? 0) > 0, label: "Send your first partnership request", href: "/dashboard/discover" },
  ];
  const completeness = Math.round((checklist.filter((c) => c.done).length / checklist.length) * 100);

  return (
    <div className="space-y-6">
      {sp.welcome && (
        <div className="flex items-center gap-4 rounded-2xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-5">
          <PartyPopper className="size-8 shrink-0 text-success" />
          <div>
            <p className="font-semibold text-green-900">Your company is live on PartnerBridge!</p>
            <p className="text-sm text-green-800">Start by exploring smart matches or browsing the marketplace.</p>
          </div>
        </div>
      )}
      {sp.denied && <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">You don&apos;t have permission to access that page. Ask your company owner or admin for access.</p>}

      <PageHeader
        eyebrow={org?.name}
        title={`Welcome back${ctx.profile.full_name ? `, ${ctx.profile.full_name.split(" ")[0]}` : ""}`}
        description="Here's what's happening across your partnerships today."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/dashboard/discover">Discover companies</Link>
            </Button>
            <Button asChild variant="accent">
              <Link href="/dashboard/opportunities/new">
                <Briefcase /> Post opportunity
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Incoming requests" value={incoming ?? 0} icon={Inbox} hint={<Link href="/dashboard/requests" className="text-accent hover:underline">Review requests →</Link>} />
        <StatCard label="Active partnerships" value={partnerships?.length ?? 0} icon={Handshake} tone="green" />
        <StatCard label="Open opportunities" value={openOpps ?? 0} icon={Briefcase} tone="violet" />
        <StatCard label="Pipeline (estimated)" value={formatCurrency(pipeline, "INR", true)} icon={TrendingUp} tone="amber" hint="Open shared deals" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Active partnerships</CardTitle>
              <Link href="/dashboard/partnerships" className="text-sm font-medium text-accent hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {(partnerships ?? []).length === 0 ? (
                <EmptyState icon={Handshake} title="No partnerships yet" description="Send a request or accept an incoming one to create your first shared workspace." action={<Button asChild size="sm"><Link href="/dashboard/matches">See recommended partners</Link></Button>} className="py-8" />
              ) : (
                <ul className="divide-y divide-border">
                  {(partnerships ?? []).slice(0, 5).map((p) => {
                    const other = partnerOf(p);
                    return (
                      <li key={p.id}>
                        <Link href={`/dashboard/partnerships/${p.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-slate-50">
                          <CompanyLogo name={other.name} src={other.logo_url} className="size-9 text-xs" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900">{other.name}</p>
                            <p className="text-xs text-slate-500">Since {formatDate(p.started_at)}</p>
                          </div>
                          <StatusBadge status={p.status} />
                          <ArrowRight className="size-4 text-slate-300" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckSquare className="size-4 text-accent" /> Pending tasks
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(tasks ?? []).length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No pending tasks 🎉</p>
                ) : (
                  <ul className="space-y-2.5">
                    {(tasks ?? []).map((t) => (
                      <li key={t.id}>
                        <Link href={`/dashboard/partnerships/${t.partnership_id}/tasks`} className="block rounded-lg border border-border p-3 hover:bg-slate-50">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-slate-900">{t.title}</p>
                            <StatusBadge status={t.priority} />
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {ptitle(t.partnership_id)} · {t.due_date ? `Due ${formatDate(t.due_date)}` : "No due date"}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock className="size-4 text-accent" /> Upcoming milestones
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(milestones ?? []).length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No upcoming milestones.</p>
                ) : (
                  <ul className="space-y-3">
                    {(milestones ?? []).map((m) => (
                      <li key={m.id}>
                        <Link href={`/dashboard/partnerships/${m.partnership_id}/milestones`} className="block space-y-1.5">
                          <div className="flex justify-between gap-2 text-sm">
                            <span className="font-medium text-slate-900">{m.title}</span>
                            <span className="shrink-0 text-xs text-slate-500">{formatDate(m.target_date)}</span>
                          </div>
                          <Progress value={m.progress} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          {completeness < 100 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Rocket className="size-4 text-accent" /> Get set up
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <Progress value={completeness} />
                  <span className="text-sm font-semibold tabular-nums">{completeness}%</span>
                </div>
                <ul className="space-y-1.5">
                  {checklist.map((c) => (
                    <li key={c.label}>
                      <Link href={c.href} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50 ${c.done ? "text-slate-400 line-through" : "text-slate-700"}`}>
                        <span className={`size-4 rounded-full border ${c.done ? "border-success bg-success" : "border-slate-300"}`} />
                        {c.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-accent" /> Top matches
              </CardTitle>
              <Link href="/dashboard/matches" className="text-sm font-medium text-accent hover:underline">
                All
              </Link>
            </CardHeader>
            <CardContent>
              {(recs ?? []).length === 0 ? (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-muted-foreground">Generate partner recommendations based on your profile.</p>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/dashboard/matches">Find matches</Link>
                  </Button>
                </div>
              ) : (
                <ul className="space-y-3">
                  {(recs ?? []).map((r) => {
                    const o = r.org as unknown as { id: string; name: string; slug: string; logo_url: string | null; verification_status: "verified" };
                    return (
                      <li key={o.id} className="flex items-center gap-3">
                        <CompanyLogo name={o.name} src={o.logo_url} className="size-9 text-xs" />
                        <div className="min-w-0 flex-1">
                          <Link href={`/companies/${o.slug}`} className="flex items-center gap-1 truncate text-sm font-medium hover:text-accent">
                            {o.name} <VerificationBadge status={o.verification_status} compact showUnverified={false} />
                          </Link>
                          <p className="truncate text-xs text-slate-500">{(r.reasons as string[])[0]}</p>
                        </div>
                        <span className="font-display text-sm font-bold text-accent">{Math.round(Number(r.score))}%</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <CardContent>
              {(activity ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <ol className="relative space-y-4 border-l border-border pl-4">
                  {(activity ?? []).map((a) => (
                    <li key={a.id} className="relative">
                      <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-white bg-accent" />
                      <p className="text-sm text-slate-700">{a.summary}</p>
                      <p className="text-xs text-slate-400">{timeAgo(a.created_at)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {org?.verification_status !== "verified" && (
            <Link href="/dashboard/company/verification" className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900 hover:bg-blue-100/60">
              <ShieldCheck className="size-5 shrink-0 text-accent" />
              <span>
                <strong>Get verified</strong> — verified companies receive more partnership requests.
              </span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

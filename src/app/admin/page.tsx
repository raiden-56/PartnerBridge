import { subDays } from "date-fns";
import { BadgeCheck, Briefcase, Building2, Clock, Flag, Handshake, IndianRupee, Inbox, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { PageHeader, StatCard, StatusBadge } from "@/components/shared/common";
import { AdminAction } from "@/components/admin/admin-controls";
import { requireAdminPage } from "@/lib/auth/admin-page";
import { createAdminClient } from "@/lib/supabase/admin";
import { markContactHandledAction } from "@/actions/admin";
import { formatCurrency, timeAgo } from "@/lib/utils";

export default async function AdminDashboard() {
  const me = await requireAdminPage("dashboard");
  const admin = createAdminClient();
  const since = subDays(new Date(), 30).toISOString();
  const head = { count: "exact" as const, head: true };
  const [companies, verified, pending, users, partnerships, requests, opps, openReports, { data: activeActors }, { data: subs }, { data: contacts }] = await Promise.all([
    admin.from("organizations").select("id", head).is("deleted_at", null),
    admin.from("organizations").select("id", head).eq("verification_status", "verified"),
    admin.from("organization_verifications").select("id", head).eq("status", "pending"),
    admin.from("profiles").select("id", head).is("deleted_at", null),
    admin.from("partnerships").select("id", head),
    admin.from("partnership_requests").select("id", head).neq("status", "draft"),
    admin.from("partnership_opportunities").select("id", head).eq("status", "published").is("deleted_at", null),
    admin.from("reports").select("id", head).in("status", ["open", "reviewing"]),
    admin.from("activity_logs").select("actor_id").gte("created_at", since).limit(10000),
    admin.from("subscriptions").select("billing_cycle, status, plan:subscription_plans(code, name, price_monthly, price_yearly)").in("status", ["trialing", "active", "past_due"]),
    admin.from("contact_messages").select("*").eq("status", "new").order("created_at", { ascending: false }).limit(10),
  ]);
  const activeUsers = new Set((activeActors ?? []).map((a) => a.actor_id).filter(Boolean)).size;
  const dist = new Map<string, number>();
  let mrr = 0;
  for (const s of subs ?? []) {
    const p = s.plan as unknown as { code: string; name: string; price_monthly: number; price_yearly: number };
    dist.set(p.name, (dist.get(p.name) ?? 0) + 1);
    if (s.status === "active") mrr += s.billing_cycle === "yearly" ? Number(p.price_yearly) / 12 : Number(p.price_monthly);
  }

  return (
    <>
      <PageHeader title="Platform overview" description="Live metrics across all tenants." />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Registered companies" value={companies.count ?? 0} icon={Building2} />
        <StatCard label="Verified companies" value={verified.count ?? 0} icon={BadgeCheck} tone="green" />
        <StatCard label="Pending verification" value={pending.count ?? 0} icon={Clock} tone="amber" />
        <StatCard label="Active users (30d)" value={activeUsers} icon={Users} tone="violet" hint={`${users.count ?? 0} registered`} />
        <StatCard label="Partnerships" value={partnerships.count ?? 0} icon={Handshake} tone="green" />
        <StatCard label="Partnership requests" value={requests.count ?? 0} icon={Inbox} />
        <StatCard label="Active opportunities" value={opps.count ?? 0} icon={Briefcase} />
        <StatCard label="MRR (paid, active)" value={formatCurrency(mrr)} icon={IndianRupee} tone="green" hint="Monthly-equivalent of active paid plans" />
        <StatCard label="Open reports" value={openReports.count ?? 0} icon={Flag} tone="amber" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Subscription distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from(dist).map(([name, n]) => {
              const total = (subs ?? []).length || 1;
              return (
                <div key={name} className="grid grid-cols-[120px_1fr_40px] items-center gap-3 text-sm">
                  <span>{name}</span>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-[#2a78d6]" style={{ width: `${(n / total) * 100}%` }} />
                  </div>
                  <span className="text-right tabular-nums">{n}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>New contact enquiries</CardTitle>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>From</TH>
                <TH>Message</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {(contacts ?? []).length === 0 && (
                <TR>
                  <TD colSpan={3} className="text-center text-muted-foreground">
                    No new enquiries
                  </TD>
                </TR>
              )}
              {(contacts ?? []).map((c) => (
                <TR key={c.id}>
                  <TD className="text-xs">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-slate-500">{c.email}</p>
                    <p className="text-slate-400">{timeAgo(c.created_at)}</p>
                  </TD>
                  <TD className="max-w-xs text-xs text-slate-600">{c.message}</TD>
                  <TD>
                    <AdminAction label="Handled" action={markContactHandledAction.bind(null, c.id)} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Signed in as {me.platform_role === "super_admin" ? "super admin" : "moderator"}. <StatusBadge status="active" />
      </p>
    </>
  );
}

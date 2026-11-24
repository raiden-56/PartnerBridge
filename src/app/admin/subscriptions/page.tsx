import { Card, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { PageHeader, StatusBadge } from "@/components/shared/common";
import { AssignPlan } from "@/components/admin/admin-controls";
import { requireAdminPage } from "@/lib/auth/admin-page";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/utils";

export default async function AdminSubscriptions() {
  await requireAdminPage("subscriptions");
  const admin = createAdminClient();
  const [{ data: subs }, { data: plans }] = await Promise.all([
    admin
      .from("subscriptions")
      .select("id, status, billing_cycle, current_period_end, trial_ends_at, cancel_at_period_end, provider, organization_id, organization:organizations(name), plan:subscription_plans(name)")
      .in("status", ["trialing", "active", "past_due"])
      .order("created_at", { ascending: false })
      .limit(300),
    admin.from("subscription_plans").select("code, name").eq("is_active", true).order("sort_order"),
  ]);
  return (
    <>
      <PageHeader title="Subscription management" description="Live subscriptions per company. Manually assign plans (e.g. Enterprise contracts or support credits)." />
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Company</TH>
              <TH>Plan</TH>
              <TH>Status</TH>
              <TH className="hidden md:table-cell">Period end</TH>
              <TH>Assign plan</TH>
            </TR>
          </THead>
          <TBody>
            {(subs ?? []).map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{(s.organization as unknown as { name: string })?.name}</TD>
                <TD>
                  {(s.plan as unknown as { name: string })?.name}{" "}
                  <span className="text-xs text-slate-500">
                    {s.billing_cycle} · {s.provider ?? "—"}
                  </span>
                </TD>
                <TD>
                  <StatusBadge status={s.status} /> {s.cancel_at_period_end && <span className="text-xs text-amber-600">cancelling</span>}
                </TD>
                <TD className="hidden text-xs md:table-cell">{formatDate(s.trial_ends_at ?? s.current_period_end)}</TD>
                <TD>
                  <AssignPlan orgId={s.organization_id} plans={plans ?? []} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}

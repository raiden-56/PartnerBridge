import type { Metadata } from "next";
import { AlertTriangle, CreditCard, Download, Receipt } from "lucide-react";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { PageHeader, StatusBadge } from "@/components/shared/common";
import { BillingPlanGrid } from "@/components/billing/plan-grid";
import { CancelButton, CheckoutButton, TrialButton } from "@/components/billing/checkout-button";
import { Button } from "@/components/ui/button";
import { requireOrgPage } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getEntitlement, getUsage } from "@/lib/billing/entitlements";
import { LIMIT_KEYS, limitValue, type LimitKey } from "@/lib/billing/limits";
import { getPublicPlans } from "@/lib/queries/reference";
import { getPaymentProvider } from "@/lib/billing/provider";
import { formatCurrency, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  const ctx = await requireOrgPage("billing.manage");
  const supabase = await createClient();
  const ent = await getEntitlement(ctx.orgId);
  const countKeys = (Object.keys(LIMIT_KEYS) as LimitKey[]).filter((k) => LIMIT_KEYS[k].kind === "count" && k !== "recommendations");
  const [plans, usage, { data: payments }, { data: sub }, { count: trialsUsed }] = await Promise.all([
    getPublicPlans(),
    Promise.all(countKeys.map(async (k) => [k, await getUsage(ctx.orgId, k)] as const)),
    supabase.from("payments").select("id, amount, currency, status, invoice_number, created_at, paid_at, billing_cycle, failure_reason, plan:subscription_plans(name)").eq("organization_id", ctx.orgId).order("created_at", { ascending: false }).limit(50),
    supabase.from("subscriptions").select("status, cancel_at_period_end, current_period_end, trial_ends_at").eq("organization_id", ctx.orgId).in("status", ["trialing", "active", "past_due"]).maybeSingle(),
    supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("organization_id", ctx.orgId).not("trial_ends_at", "is", null),
  ]);
  const paymentsReady = getPaymentProvider().isConfigured();

  return (
    <>
      <PageHeader title="Billing & subscription" description="Manage your plan, usage limits and invoices." />
      {!paymentsReady && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Online payments are not configured on this deployment (Razorpay keys missing). Plans can still be assigned by a platform administrator.
        </div>
      )}
      {getPaymentProvider().name === "demo" && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Local demo mode: checkout is simulated. No payment window opens and no money moves. Choose whether the demo payment succeeds or fails.
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <Card>
          <CardHeader>
            <CardDescription>Current plan</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <CreditCard className="size-5 text-accent" /> {ent.planName}
              <StatusBadge status={ent.status} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {ent.periodEnd && (
              <p className="text-slate-600">
                {ent.status === "trialing" ? "Trial ends" : sub?.cancel_at_period_end ? "Access ends" : "Renews"} on <strong>{formatDate(ent.periodEnd)}</strong>
                {ent.cycle && ` · billed ${ent.cycle}`}
              </p>
            )}
            {sub?.cancel_at_period_end && <Badge variant="warning">Cancellation scheduled</Badge>}
            {ent.planCode !== "free" && (
              <div className="flex gap-2">
                {sub?.cancel_at_period_end ? <CancelButton resume /> : <CancelButton trial={ent.status === "trialing"} />}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Upgrades take effect immediately after payment. Cancellations apply at the end of the paid period. Renewals are manual: you&apos;ll be reminded 7 days before your period ends.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Usage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {usage.map(([k, used]) => {
              const limit = limitValue(ent.limits, k);
              const pct = limit < 0 ? 0 : limit === 0 ? 100 : Math.min(100, (used / limit) * 100);
              return (
                <div key={k} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-700">{LIMIT_KEYS[k].label}</span>
                    <span className="tabular-nums text-slate-500">
                      {used} / {limit < 0 ? "∞" : limit}
                    </span>
                  </div>
                  <Progress value={pct} indicatorClassName={pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-warning" : undefined} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-4 mt-10 text-lg font-semibold text-slate-900">Change plan</h2>
      <BillingPlanGrid plans={plans} currentCode={ent.planCode} trialAvailable={!trialsUsed && ent.planCode === "free"} paymentsReady={paymentsReady} />

      <Card className="mt-10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="size-4 text-accent" /> Billing history
          </CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Plan</TH>
              <TH>Amount</TH>
              <TH>Status</TH>
              <TH>Invoice</TH>
            </TR>
          </THead>
          <TBody>
            {(payments ?? []).length === 0 && (
              <TR>
                <TD colSpan={5} className="py-8 text-center text-muted-foreground">
                  No payments yet.
                </TD>
              </TR>
            )}
            {(payments ?? []).map((p) => (
              <TR key={p.id}>
                <TD>{formatDate(p.paid_at ?? p.created_at)}</TD>
                <TD>
                  {(p.plan as unknown as { name: string } | null)?.name} <span className="text-xs text-slate-500">({p.billing_cycle})</span>
                </TD>
                <TD className="tabular-nums">{formatCurrency(p.amount, p.currency)}</TD>
                <TD>
                  <StatusBadge status={p.status} />
                  {p.failure_reason && <p className="text-xs text-destructive">{p.failure_reason}</p>}
                </TD>
                <TD>
                  {p.status === "paid" && p.invoice_number ? (
                    <Button asChild size="sm" variant="ghost">
                      <a href={`/api/billing/invoice/${p.id}`}>
                        <Download /> {p.invoice_number}
                      </a>
                    </Button>
                  ) : (
                    "—"
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}

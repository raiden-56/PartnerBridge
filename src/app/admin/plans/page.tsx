import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { PageHeader } from "@/components/shared/common";
import { PlanEditor } from "@/components/admin/admin-controls";
import { requireAdminPage } from "@/lib/auth/admin-page";
import { createAdminClient } from "@/lib/supabase/admin";
import { LIMIT_KEYS } from "@/lib/billing/limits";

export default async function AdminPlans() {
  await requireAdminPage("plans");
  const { data } = await createAdminClient().from("subscription_plans").select("*").order("sort_order");
  return (
    <>
      <PageHeader title="Plans & limits" description="Edit prices, trials, features and usage limits. Changes apply immediately to entitlement checks." />
      <p className="mb-4 text-xs text-muted-foreground">
        Limit keys:{" "}
        {Object.entries(LIMIT_KEYS)
          .map(([k, v]) => `${k} (${v.label})`)
          .join(" · ")}
      </p>
      <div className="grid gap-6 xl:grid-cols-2">
        {(data ?? []).map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle>
                {p.name} <span className="font-mono text-xs text-slate-400">{p.code}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PlanEditor plan={{ ...p, price_monthly: Number(p.price_monthly), price_yearly: Number(p.price_yearly) }} />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

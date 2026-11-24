import { Card, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { PageHeader, StatusBadge } from "@/components/shared/common";
import { Pagination } from "@/components/shared/pagination";
import { requireAdminPage } from "@/lib/auth/admin-page";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function AdminPayments({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireAdminPage("payments");
  const page = Number((await searchParams).page) || 1;
  const admin = createAdminClient();
  const { data, count } = await admin
    .from("payments")
    .select("id, amount, currency, status, provider, provider_order_id, provider_payment_id, invoice_number, failure_reason, created_at, paid_at, billing_cycle, organization:organizations(name), plan:subscription_plans(name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * 30, page * 30 - 1);
  const paid = (data ?? []).filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);
  return (
    <>
      <PageHeader title="Payment transactions" description={`Only provider-verified payments are marked paid. Paid on this page: ${formatCurrency(paid)}.`} />
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Company</TH>
              <TH>Plan</TH>
              <TH className="text-right">Amount</TH>
              <TH>Status</TH>
              <TH className="hidden lg:table-cell">Provider refs</TH>
            </TR>
          </THead>
          <TBody>
            {(data ?? []).map((p) => (
              <TR key={p.id}>
                <TD className="text-xs">{formatDate(p.paid_at ?? p.created_at, "d MMM yyyy HH:mm")}</TD>
                <TD className="font-medium">{(p.organization as unknown as { name: string })?.name}</TD>
                <TD className="text-xs">
                  {(p.plan as unknown as { name: string })?.name} ({p.billing_cycle})
                </TD>
                <TD className="text-right tabular-nums">{formatCurrency(p.amount, p.currency)}</TD>
                <TD>
                  <StatusBadge status={p.status} />
                  {p.failure_reason && <p className="text-[11px] text-destructive">{p.failure_reason}</p>}
                </TD>
                <TD className="hidden font-mono text-[11px] text-slate-500 lg:table-cell">
                  {p.provider}: {p.provider_order_id ?? "—"} / {p.provider_payment_id ?? "—"} {p.invoice_number && `· ${p.invoice_number}`}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Pagination page={page} total={count ?? 0} perPage={30} />
    </>
  );
}

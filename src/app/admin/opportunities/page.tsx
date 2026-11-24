import Link from "next/link";
import { Card, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { PageHeader, StatusBadge } from "@/components/shared/common";
import { AdminAction } from "@/components/admin/admin-controls";
import { Pagination } from "@/components/shared/pagination";
import { requireAdminPage } from "@/lib/auth/admin-page";
import { createAdminClient } from "@/lib/supabase/admin";
import { moderateOpportunityAction } from "@/actions/admin";
import { formatDate } from "@/lib/utils";

export default async function AdminOpportunities({ searchParams }: { searchParams: Promise<{ page?: string; status?: string }> }) {
  await requireAdminPage("opportunities");
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const admin = createAdminClient();
  let q = admin.from("partnership_opportunities").select("id, title, status, application_count, created_at, organization:organizations(name, slug)", { count: "exact" }).is("deleted_at", null).order("created_at", { ascending: false });
  if (sp.status) q = q.eq("status", sp.status);
  const { data, count } = await q.range((page - 1) * 25, page * 25 - 1);
  return (
    <>
      <PageHeader title="Opportunity moderation" description="Remove misleading or inappropriate opportunities. Companies are notified." />
      <div className="mb-4 flex gap-1.5">
        {["", "published", "paused", "closed", "removed", "draft"].map((s) => (
          <Link key={s} href={s ? `/admin/opportunities?status=${s}` : "/admin/opportunities"} className={`rounded-full border px-3 py-1 text-xs capitalize ${(sp.status ?? "") === s ? "border-accent bg-blue-50 text-accent" : "border-border bg-white"}`}>
            {s || "All"}
          </Link>
        ))}
      </div>
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Opportunity</TH>
              <TH>Status</TH>
              <TH className="text-right">Applications</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {(data ?? []).map((o) => {
              const org = o.organization as unknown as { name: string; slug: string };
              return (
                <TR key={o.id}>
                  <TD>
                    <Link href={`/opportunities/${o.id}`} target="_blank" className="font-medium hover:text-accent">{o.title}</Link>
                    <p className="text-xs text-slate-500">{org?.name} · {formatDate(o.created_at)}</p>
                  </TD>
                  <TD><StatusBadge status={o.status} /></TD>
                  <TD className="text-right tabular-nums">{o.application_count}</TD>
                  <TD>
                    {o.status === "removed" ? (
                      <AdminAction label="Restore" action={moderateOpportunityAction.bind(null, o.id, "restore")} prompt="Note to company" confirmTitle="Restore as draft?" />
                    ) : (
                      <AdminAction label="Remove" variant="destructive" action={moderateOpportunityAction.bind(null, o.id, "remove")} prompt="Reason (shared with the company)" confirmTitle="Remove opportunity?" />
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
      <Pagination page={page} total={count ?? 0} perPage={25} />
    </>
  );
}

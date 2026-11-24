import { Card, Input, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { PageHeader } from "@/components/shared/common";
import { Pagination } from "@/components/shared/pagination";
import { requireAdminPage } from "@/lib/auth/admin-page";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/utils";

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ page?: string; action?: string }> }) {
  await requireAdminPage("audit");
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  let q = createAdminClient().from("audit_logs").select("id, action, target_type, target_id, metadata, ip_address, created_at, actor:profiles(full_name, email)", { count: "exact" }).order("created_at", { ascending: false });
  if (sp.action) q = q.ilike("action", `%${sp.action.replace(/[%,()]/g, "")}%`);
  const { data, count } = await q.range((page - 1) * 50, page * 50 - 1);
  return (
    <>
      <PageHeader title="Audit logs" description="Append-only record of privileged and administrative actions." />
      <form className="mb-4 max-w-xs">
        <Input name="action" defaultValue={sp.action} placeholder="Filter by action, e.g. verification" />
      </form>
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Actor</TH>
              <TH>Action</TH>
              <TH>Target</TH>
              <TH className="hidden lg:table-cell">Details</TH>
            </TR>
          </THead>
          <TBody>
            {(data ?? []).map((a) => {
              const actor = a.actor as unknown as { full_name: string | null; email: string } | null;
              return (
                <TR key={a.id}>
                  <TD className="whitespace-nowrap text-xs">{formatDate(a.created_at, "d MMM yy HH:mm:ss")}</TD>
                  <TD className="text-xs">{actor?.full_name ?? actor?.email ?? "system"}</TD>
                  <TD className="font-mono text-xs">{a.action}</TD>
                  <TD className="font-mono text-[11px] text-slate-500">
                    {a.target_type}:{a.target_id?.slice(0, 8)}
                  </TD>
                  <TD className="hidden max-w-md truncate font-mono text-[11px] text-slate-500 lg:table-cell">
                    {JSON.stringify(a.metadata)} {a.ip_address && `· ${a.ip_address}`}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
      <Pagination page={page} total={count ?? 0} perPage={50} />
    </>
  );
}

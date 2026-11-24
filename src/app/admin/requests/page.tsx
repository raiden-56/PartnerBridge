import { subDays } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { PageHeader, StatusBadge } from "@/components/shared/common";
import { AdminAction } from "@/components/admin/admin-controls";
import { requireAdminPage } from "@/lib/auth/admin-page";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelRequestAsModeratorAction } from "@/actions/admin";
import { timeAgo } from "@/lib/utils";

/** Abuse monitoring: senders with unusually high volume or rejection rates. Message bodies are shown only for flagged review. */
export default async function AdminRequests() {
  await requireAdminPage("requests");
  const admin = createAdminClient();
  const since = subDays(new Date(), 7).toISOString();
  const [{ data: recent }, { data: reportsOnRequests }] = await Promise.all([
    admin
      .from("partnership_requests")
      .select("id, subject, status, sent_at, sender_organization_id, sender:organizations!partnership_requests_sender_organization_id_fkey(name), receiver:organizations!partnership_requests_receiver_organization_id_fkey(name)")
      .neq("status", "draft")
      .gte("sent_at", since)
      .order("sent_at", { ascending: false })
      .limit(1000),
    admin.from("reports").select("target_id").eq("target_type", "request").in("status", ["open", "reviewing"]),
  ]);
  const reported = new Set((reportsOnRequests ?? []).map((r) => r.target_id));
  const bySender = new Map<string, { name: string; total: number; rejected: number }>();
  for (const r of recent ?? []) {
    const s = bySender.get(r.sender_organization_id) ?? { name: (r.sender as unknown as { name: string }).name, total: 0, rejected: 0 };
    s.total++;
    if (r.status === "rejected") s.rejected++;
    bySender.set(r.sender_organization_id, s);
  }
  const senders = Array.from(bySender.values())
    .map((s) => ({ ...s, rate: s.total ? Math.round((s.rejected / s.total) * 100) : 0, flagged: s.total >= 15 || (s.total >= 5 && s.rejected / s.total >= 0.6) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);

  return (
    <>
      <PageHeader title="Partnership request monitoring" description="Detect spam patterns: high sending volume, high rejection rates and reported requests (last 7 days)." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top senders (7 days)</CardTitle>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Company</TH>
                <TH className="text-right">Sent</TH>
                <TH className="text-right">Rejected</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {senders.map((s) => (
                <TR key={s.name}>
                  <TD className="font-medium">{s.name}</TD>
                  <TD className="text-right tabular-nums">{s.total}</TD>
                  <TD className="text-right tabular-nums">{s.rate}%</TD>
                  <TD>
                    {s.flagged && (
                      <Badge variant="warning">
                        <AlertTriangle /> Review
                      </Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent requests</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[520px] space-y-2 overflow-y-auto">
            {(recent ?? []).slice(0, 60).map((r) => (
              <div key={r.id} className={`flex items-center gap-2 rounded-lg border p-2.5 text-sm ${reported.has(r.id) ? "border-amber-300 bg-amber-50" : "border-border"}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.subject}</p>
                  <p className="truncate text-xs text-slate-500">
                    {(r.sender as unknown as { name: string }).name} → {(r.receiver as unknown as { name: string }).name} · {timeAgo(r.sent_at)}
                    {reported.has(r.id) && " · reported"}
                  </p>
                </div>
                <StatusBadge status={r.status} />
                {["sent", "viewed", "negotiation"].includes(r.status) && <AdminAction label="Cancel" variant="destructive" action={cancelRequestAsModeratorAction.bind(null, r.id)} prompt="Reason" confirmTitle="Cancel this request?" />}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

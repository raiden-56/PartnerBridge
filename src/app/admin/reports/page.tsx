import Link from "next/link";
import { Flag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/primitives";
import { EmptyState, PageHeader, StatusBadge } from "@/components/shared/common";
import { AdminAction } from "@/components/admin/admin-controls";
import { requireAdminPage } from "@/lib/auth/admin-page";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveReportAction } from "@/actions/admin";
import { timeAgo } from "@/lib/utils";

async function targetLink(admin: ReturnType<typeof createAdminClient>, type: string, id: string) {
  if (type === "organization") {
    const { data } = await admin.from("organizations").select("name, slug").eq("id", id).maybeSingle();
    return data ? { label: data.name, href: `/companies/${data.slug}` } : null;
  }
  if (type === "opportunity") {
    const { data } = await admin.from("partnership_opportunities").select("title").eq("id", id).maybeSingle();
    return data ? { label: data.title, href: `/opportunities/${id}` } : null;
  }
  if (type === "request") {
    const { data } = await admin.from("partnership_requests").select("subject").eq("id", id).maybeSingle();
    return data ? { label: data.subject, href: "/admin/requests" } : null;
  }
  return { label: `${type} ${id.slice(0, 8)}`, href: "#" };
}

export default async function AdminReports({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminPage("reports");
  const { status = "open" } = await searchParams;
  const admin = createAdminClient();
  const { data } = await admin
    .from("reports")
    .select("*, reporter:profiles!reports_reporter_id_fkey(full_name, email), reporter_org:organizations!reports_reporter_organization_id_fkey(name)")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(100);
  const links = await Promise.all((data ?? []).map((r) => targetLink(admin, r.target_type, r.target_id)));
  return (
    <>
      <PageHeader title="Reports & complaints" description="User reports about companies, opportunities, requests and messages." />
      <div className="mb-4 flex gap-1.5">
        {["open", "reviewing", "resolved", "dismissed"].map((s) => (
          <Link key={s} href={`/admin/reports?status=${s}`} className={`rounded-full border px-3 py-1 text-xs capitalize ${status === s ? "border-accent bg-blue-50 text-accent" : "border-border bg-white"}`}>
            {s}
          </Link>
        ))}
      </div>
      {(data ?? []).length === 0 ? (
        <EmptyState icon={Flag} title="No reports here" />
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((r, i) => (
            <Card key={r.id}>
              <CardContent className="flex flex-col gap-3 pt-5 md:flex-row md:items-start">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={r.status} />
                    <span className="text-sm font-semibold capitalize">{r.reason}</span>
                    <span className="text-xs text-slate-500">· {r.target_type}</span>
                  </div>
                  {links[i] && (
                    <Link href={links[i]!.href} target="_blank" className="text-sm text-accent hover:underline">
                      {links[i]!.label}
                    </Link>
                  )}
                  {r.details && <p className="text-sm text-slate-700">{r.details}</p>}
                  <p className="text-xs text-slate-500">
                    Reported by {(r.reporter as { full_name: string | null; email: string } | null)?.full_name ?? "user"}
                    {(r.reporter_org as { name: string } | null)?.name && ` (${(r.reporter_org as { name: string }).name})`} · {timeAgo(r.created_at)}
                  </p>
                  {r.resolution_notes && <p className="text-xs text-slate-500">Resolution: {r.resolution_notes}</p>}
                </div>
                {["open", "reviewing"].includes(r.status) && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {r.status === "open" && <AdminAction label="Start review" action={resolveReportAction.bind(null, r.id, "reviewing")} />}
                    <AdminAction label="Resolve" variant="success" action={resolveReportAction.bind(null, r.id, "resolved")} prompt="Resolution notes (shared with reporter)" confirmTitle="Resolve report" />
                    <AdminAction label="Dismiss" action={resolveReportAction.bind(null, r.id, "dismissed")} prompt="Why is no action needed?" confirmTitle="Dismiss report" />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

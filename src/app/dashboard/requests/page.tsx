import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, FilePen, Inbox, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { CompanyLogo, EmptyState, PageHeader, StatusBadge, VerificationBadge } from "@/components/shared/common";
import { requireOrgPage } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Partnership requests" };

const SELECT =
  "id, subject, status, created_at, sent_at, last_activity_at, introduction, category:partnership_categories(name), " +
  "sender:organizations!partnership_requests_sender_organization_id_fkey(id, name, slug, logo_url, verification_status, city, country), " +
  "receiver:organizations!partnership_requests_receiver_organization_id_fkey(id, name, slug, logo_url, verification_status, city, country)";

type Row = {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  last_activity_at: string;
  introduction: string;
  category: { name: string } | null;
  sender: { id: string; name: string; slug: string; logo_url: string | null; verification_status: "verified"; city: string | null; country: string | null };
  receiver: Row["sender"];
};

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string }> }) {
  const ctx = await requireOrgPage("requests.manage");
  const sp = await searchParams;
  const tab = sp.tab === "outgoing" ? "outgoing" : sp.tab === "drafts" ? "drafts" : "incoming";
  const supabase = await createClient();

  let q = supabase.from("partnership_requests").select(SELECT).order("last_activity_at", { ascending: false }).limit(100);
  if (tab === "incoming") q = q.eq("receiver_organization_id", ctx.orgId).neq("status", "draft");
  if (tab === "outgoing") q = q.eq("sender_organization_id", ctx.orgId).neq("status", "draft");
  if (tab === "drafts") q = q.eq("sender_organization_id", ctx.orgId).eq("status", "draft");
  if (sp.status) q = q.eq("status", sp.status);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Row[];

  const [{ count: inCount }, { count: outCount }, { count: draftCount }] = await Promise.all([
    supabase.from("partnership_requests").select("id", { count: "exact", head: true }).eq("receiver_organization_id", ctx.orgId).in("status", ["sent", "viewed", "negotiation"]),
    supabase.from("partnership_requests").select("id", { count: "exact", head: true }).eq("sender_organization_id", ctx.orgId).in("status", ["sent", "viewed", "negotiation"]),
    supabase.from("partnership_requests").select("id", { count: "exact", head: true }).eq("sender_organization_id", ctx.orgId).eq("status", "draft"),
  ]);

  const tabs = [
    { key: "incoming", label: "Incoming", icon: ArrowDownLeft, count: inCount },
    { key: "outgoing", label: "Outgoing", icon: ArrowUpRight, count: outCount },
    { key: "drafts", label: "Drafts", icon: FilePen, count: draftCount },
  ];
  const statuses = tab === "drafts" ? [] : ["sent", "viewed", "negotiation", "accepted", "rejected", "cancelled", "expired"];

  return (
    <>
      <PageHeader
        title="Partnership requests"
        description="Review incoming proposals, track the requests you've sent and pick up drafts."
        actions={
          <Button asChild variant="accent">
            <Link href="/dashboard/requests/new">
              <Plus /> New request
            </Link>
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/dashboard/requests?tab=${t.key}`}
              className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium", tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}
            >
              <t.icon className="size-4" /> {t.label}
              {!!t.count && <Badge variant={tab === t.key ? "accent" : "outline"}>{t.count}</Badge>}
            </Link>
          ))}
        </div>
        {statuses.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <Link href={`/dashboard/requests?tab=${tab}`} className={cn("rounded-full border px-2.5 py-1 text-xs", !sp.status ? "border-accent bg-blue-50 text-accent" : "border-border bg-card text-slate-600")}>
              All
            </Link>
            {statuses.map((s) => (
              <Link
                key={s}
                href={`/dashboard/requests?tab=${tab}&status=${s}`}
                className={cn("rounded-full border px-2.5 py-1 text-xs capitalize", sp.status === s ? "border-accent bg-blue-50 text-accent" : "border-border bg-card text-slate-600")}
              >
                {s}
              </Link>
            ))}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={tab === "incoming" ? "No incoming requests" : tab === "outgoing" ? "No outgoing requests" : "No drafts"}
          description={tab === "incoming" ? "Publish opportunities and complete your profile to attract partners." : "Find companies and send a tailored partnership request."}
          action={
            <Button asChild variant="outline">
              <Link href="/dashboard/discover">Discover companies</Link>
            </Button>
          }
        />
      ) : (
        <Card className="divide-y divide-border">
          {rows.map((r) => {
            const other = tab === "incoming" ? r.sender : r.receiver;
            const unseen = tab === "incoming" && r.status === "sent";
            return (
              <Link key={r.id} href={`/dashboard/requests/${r.id}`} className={cn("flex flex-col gap-3 p-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center", unseen && "bg-blue-50/40")}>
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <CompanyLogo name={other.name} src={other.logo_url} className="size-10 text-xs" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={cn("text-sm text-slate-900", unseen ? "font-bold" : "font-semibold")}>{other.name}</span>
                      <VerificationBadge status={other.verification_status} compact showUnverified={false} />
                      {r.category && <Badge variant="outline">{r.category.name}</Badge>}
                    </div>
                    <p className="truncate text-sm text-slate-700">{r.subject}</p>
                    <p className="truncate text-xs text-slate-500">{r.introduction}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3 pl-13 sm:pl-0">
                  <div className="text-right text-xs text-slate-500">
                    <p>{tab === "drafts" ? `Created ${formatDate(r.created_at)}` : `${tab === "incoming" ? "Received" : "Sent"} ${formatDate(r.sent_at)}`}</p>
                    <p>Last activity {timeAgo(r.last_activity_at)}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              </Link>
            );
          })}
        </Card>
      )}
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Bell, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { EmptyState, PageHeader } from "@/components/shared/common";
import { NotificationRowActions, MarkAllRead } from "@/components/app/notification-actions";
import { Pagination } from "@/components/shared/pagination";
import { requireOrgPage } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notifications/types";
import { cn, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string; filter?: string }> }) {
  const ctx = await requireOrgPage();
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const supabase = await createClient();
  let q = supabase.from("notifications").select("id, type, title, body, link, read_at, created_at", { count: "exact" }).eq("user_id", ctx.userId).order("created_at", { ascending: false });
  if (sp.filter === "unread") q = q.is("read_at", null);
  const { data, count } = await q.range((page - 1) * 30, page * 30 - 1);

  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          <>
            <MarkAllRead />
            <Button asChild variant="outline">
              <Link href="/dashboard/settings#notifications">
                <Settings /> Preferences
              </Link>
            </Button>
          </>
        }
      />
      <div className="mb-4 flex gap-1.5">
        {[
          ["", "All"],
          ["unread", "Unread"],
        ].map(([k, l]) => (
          <Link key={k} href={k ? `/dashboard/notifications?filter=${k}` : "/dashboard/notifications"} className={cn("rounded-full border px-3 py-1 text-xs", (sp.filter ?? "") === k ? "border-accent bg-blue-50 text-accent" : "border-border bg-card text-slate-600")}>
            {l}
          </Link>
        ))}
      </div>
      {(data ?? []).length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" description="You'll be notified about requests, messages, applications, tasks and more." />
      ) : (
        <Card className="divide-y divide-border">
          {(data ?? []).map((n) => (
            <div key={n.id} className={cn("flex items-start gap-3 p-4", !n.read_at && "bg-blue-50/40")}>
              <span className={cn("mt-2 size-2 shrink-0 rounded-full", n.read_at ? "bg-slate-200" : "bg-accent")} />
              <div className="min-w-0 flex-1">
                {n.link ? (
                  <Link href={n.link} className="text-sm font-medium text-slate-900 hover:text-accent">
                    {n.title}
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-slate-900">{n.title}</p>
                )}
                {n.body && <p className="text-sm text-slate-600">{n.body}</p>}
                <p className="mt-0.5 text-xs text-slate-400">
                  {NOTIFICATION_TYPES[n.type as NotificationType]?.label ?? n.type} · {timeAgo(n.created_at)}
                </p>
              </div>
              <NotificationRowActions id={n.id} read={!!n.read_at} />
            </div>
          ))}
        </Card>
      )}
      <Pagination page={page} total={count ?? 0} perPage={30} />
    </>
  );
}

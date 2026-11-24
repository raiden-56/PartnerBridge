import type { Metadata } from "next";
import Link from "next/link";
import { Handshake, MessageSquare, Search } from "lucide-react";
import { Badge, Card, Input } from "@/components/ui/primitives";
import { CompanyLogo, EmptyState, PageHeader } from "@/components/shared/common";
import { requireOrgPage } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { cn, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireOrgPage();
  const { q } = await searchParams;
  const supabase = await createClient();
  const [{ data: convs }, { data: unread }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, kind, subject, partnership_id, last_message_at, last_message_preview, organization_a_id, organization_b_id, created_at, a:organizations!conversations_organization_a_id_fkey(id, name, logo_url), b:organizations!conversations_organization_b_id_fkey(id, name, logo_url)")
      .or(`organization_a_id.eq.${ctx.orgId},organization_b_id.eq.${ctx.orgId}`)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(100),
    supabase.rpc("my_unread_counts"),
  ]);
  const unreadMap = new Map(((unread ?? []) as { conversation_id: string; unread: number }[]).map((u) => [u.conversation_id, Number(u.unread)]));

  // Message search (RLS limits results to conversations the user can access).
  let matches: Set<string> | null = null;
  if (q?.trim()) {
    const term = q.replace(/[%,()*\\]/g, " ").trim().slice(0, 80);
    const { data } = await supabase.from("partnership_messages").select("conversation_id").ilike("body", `%${term}%`).limit(500);
    matches = new Set((data ?? []).map((m) => m.conversation_id as string));
  }

  const rows = (convs ?? [])
    .map((c) => {
      const other = (c.organization_a_id === ctx.orgId ? c.b : c.a) as unknown as { id: string; name: string; logo_url: string | null };
      return { ...c, other, unread: unreadMap.get(c.id) ?? 0 };
    })
    .filter((c) => !matches || matches.has(c.id) || c.other.name.toLowerCase().includes(q!.toLowerCase()) || (c.subject ?? "").toLowerCase().includes(q!.toLowerCase()));

  return (
    <>
      <PageHeader title="Messages" description="Partnership workspaces and direct company conversations." />
      <form className="relative mb-4 max-w-md" role="search">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input name="q" defaultValue={q} placeholder="Search conversations and messages" className="pl-9" aria-label="Search messages" />
      </form>
      {rows.length === 0 ? (
        <EmptyState icon={MessageSquare} title={q ? "No conversations match your search" : "No conversations yet"} description="Conversations start when a partnership is created or when you contact a company from its profile." />
      ) : (
        <Card className="divide-y divide-border">
          {rows.map((c) => (
            <Link key={c.id} href={c.partnership_id ? `/dashboard/partnerships/${c.partnership_id}/messages` : `/dashboard/messages/${c.id}`} className={cn("flex items-center gap-3 p-4 hover:bg-slate-50", c.unread > 0 && "bg-blue-50/40")}>
              <CompanyLogo name={c.other.name} src={c.other.logo_url} className="size-11" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={cn("truncate text-sm text-slate-900", c.unread ? "font-bold" : "font-semibold")}>{c.other.name}</p>
                  {c.kind === "partnership" ? (
                    <Badge variant="success">
                      <Handshake /> Partnership
                    </Badge>
                  ) : (
                    <Badge variant="outline">Direct</Badge>
                  )}
                </div>
                <p className={cn("truncate text-sm", c.unread ? "text-slate-800" : "text-slate-500")}>{c.last_message_preview ?? c.subject ?? "No messages yet"}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-xs text-slate-400">{timeAgo(c.last_message_at ?? c.created_at)}</span>
                {c.unread > 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">{c.unread}</span>}
              </div>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}

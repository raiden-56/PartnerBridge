import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Chat } from "@/components/messages/chat";
import { CompanyLogo } from "@/components/shared/common";
import { requireOrgPage } from "@/lib/auth/session";
import { loadConversation } from "@/lib/queries/conversation";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireOrgPage();
  const data = await loadConversation(id, ctx.memberships.map((m) => m.organization_id));
  if (!data) notFound();
  if (data.conv.partnership_id) redirect(`/dashboard/partnerships/${data.conv.partnership_id}/messages`);
  return (
    <div className="flex h-[calc(100dvh-10rem)] min-h-[480px] flex-col overflow-hidden rounded-2xl border border-border bg-slate-50/50 shadow-[var(--shadow-card)] lg:h-[calc(100dvh-8rem)]">
      <div className="flex items-center gap-3 border-b border-border bg-white px-4 py-3">
        <Link href="/dashboard/messages" className="rounded-md p-1.5 hover:bg-secondary" aria-label="Back to messages">
          <ArrowLeft className="size-4" />
        </Link>
        <CompanyLogo name={data.other.name} src={data.other.logo_url} className="size-9 text-xs" />
        <div className="min-w-0">
          <Link href={`/companies/${data.other.slug}`} className="block truncate font-semibold text-slate-900 hover:text-accent">
            {data.other.name}
          </Link>
          <p className="truncate text-xs text-slate-500">{data.conv.subject ?? "Direct conversation"}</p>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <Chat
          conversationId={id}
          myUserId={ctx.userId}
          myOrgId={data.myOrgId}
          orgNames={data.orgNames}
          people={data.people}
          initialMessages={data.messages}
          initialOtherReadAt={data.otherReadAt}
        />
      </div>
    </div>
  );
}

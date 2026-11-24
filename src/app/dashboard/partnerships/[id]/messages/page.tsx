import { notFound } from "next/navigation";
import { Chat } from "@/components/messages/chat";
import { getWorkspace } from "@/lib/queries/workspace";
import { loadConversation } from "@/lib/queries/conversation";
import { createClient } from "@/lib/supabase/server";

export default async function WorkspaceMessages({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const supabase = await createClient();
  const { data: conv } = await supabase.from("conversations").select("id").eq("partnership_id", id).maybeSingle();
  if (!conv) notFound();
  const data = await loadConversation(conv.id, ws.ctx.memberships.map((m) => m.organization_id));
  if (!data) notFound();
  return (
    <div className="h-[calc(100dvh-22rem)] min-h-[480px] overflow-hidden rounded-2xl border border-border bg-slate-50/50 shadow-[var(--shadow-card)]">
      <Chat
        conversationId={conv.id}
        myUserId={ws.ctx.userId}
        myOrgId={data.myOrgId}
        orgNames={data.orgNames}
        people={data.people}
        initialMessages={data.messages}
        initialOtherReadAt={data.otherReadAt}
        readOnly={ws.partnership.status === "ended"}
      />
    </div>
  );
}

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ChatMessage } from "@/components/messages/chat";

/** Loads a conversation the current user can access (RLS returns nothing otherwise). */
export async function loadConversation(conversationId: string, myOrgIds: string[]) {
  const supabase = await createClient();
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, kind, subject, partnership_id, organization_a_id, organization_b_id, a:organizations!conversations_organization_a_id_fkey(id, name, slug, logo_url), b:organizations!conversations_organization_b_id_fkey(id, name, slug, logo_url)")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return null;

  const myOrgId = myOrgIds.find((id) => id === conv.organization_a_id || id === conv.organization_b_id);
  if (!myOrgId) return null;
  const otherOrgId = conv.organization_a_id === myOrgId ? conv.organization_b_id : conv.organization_a_id;

  const [{ data: msgs }, { data: reads }, { data: members }] = await Promise.all([
    supabase
      .from("partnership_messages")
      .select("id, body, sender_id, sender_organization_id, created_at, attachments:message_attachments(id, file_name, size_bytes)")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("conversation_reads").select("organization_id, last_read_at").eq("conversation_id", conversationId),
    supabase.from("organization_members").select("user_id, profile:profiles!organization_members_user_id_fkey(id, full_name, avatar_url)").in("organization_id", [conv.organization_a_id, conv.organization_b_id]),
  ]);

  const a = conv.a as unknown as { id: string; name: string; slug: string; logo_url: string | null };
  const b = conv.b as unknown as { id: string; name: string; slug: string; logo_url: string | null };
  const people: Record<string, { name: string; avatar: string | null }> = {};
  for (const m of members ?? []) {
    const p = m.profile as unknown as { id: string; full_name: string | null; avatar_url: string | null } | null;
    if (p) people[p.id] = { name: p.full_name ?? "Team member", avatar: p.avatar_url };
  }
  const otherReadAt = (reads ?? []).filter((r) => r.organization_id === otherOrgId).map((r) => r.last_read_at as string).sort().pop() ?? null;

  return {
    conv,
    myOrgId,
    otherOrgId,
    other: a.id === otherOrgId ? a : b,
    orgNames: { [a.id]: a.name, [b.id]: b.name },
    people,
    messages: ((msgs ?? []) as unknown as ChatMessage[]).reverse(),
    otherReadAt,
  };
}

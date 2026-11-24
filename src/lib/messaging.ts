import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UserFacingError, dbError } from "@/lib/actions";
import { requireOrg } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { notifyOrg, notifyPartnership } from "@/lib/notifications/notify";
import { uploadFile, validateFile } from "@/lib/storage";

/** Shared by the server action and the background-sync API route. */
export async function postMessage(input: { conversationId: string; body: string; clientId?: string; files?: File[] }) {
  const ctx = await requireOrg();
  await enforceRateLimit("messages_per_minute", ctx.userId);
  const supabase = await createClient();
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, kind, organization_a_id, organization_b_id, partnership_id, subject")
    .eq("id", input.conversationId)
    .maybeSingle();
  if (!conv) throw new UserFacingError("Conversation not found");

  const myOrg = ctx.memberships.find((m) => m.organization_id === conv.organization_a_id || m.organization_id === conv.organization_b_id);
  if (!myOrg) throw new UserFacingError("You are not part of this conversation");
  const otherOrgId = conv.organization_a_id === myOrg.organization_id ? conv.organization_b_id : conv.organization_a_id;

  if (conv.partnership_id) {
    const { data: p } = await supabase.from("partnerships").select("status").eq("id", conv.partnership_id).single();
    if (p?.status === "ended") throw new UserFacingError("This partnership has ended; the conversation is read-only.");
  }

  const files = (input.files ?? []).filter((f) => f.size > 0).slice(0, 5);
  files.forEach((f) => validateFile(f, "document"));

  const { data: msg, error } = await supabase
    .from("partnership_messages")
    .insert({
      conversation_id: conv.id,
      partnership_id: conv.partnership_id,
      sender_id: ctx.userId,
      sender_organization_id: myOrg.organization_id,
      body: input.body,
      client_id: input.clientId ?? null,
    })
    .select("id, created_at")
    .single();
  if (error) {
    if (error.code === "23505") return { id: null, duplicate: true }; // idempotent retry from offline outbox
    dbError(error, "Message could not be sent");
  }

  for (const f of files) {
    const ref = await uploadFile(supabase, "partnership-files", `c/${conv.id}`, f);
    await supabase.from("message_attachments").insert({ message_id: msg!.id, conversation_id: conv.id, storage_path: ref.path, file_name: ref.name, mime_type: ref.type, size_bytes: ref.size });
  }

  // Mark own read cursor.
  await supabase.from("conversation_reads").upsert({ conversation_id: conv.id, user_id: ctx.userId, organization_id: myOrg.organization_id, last_read_at: new Date().toISOString() });

  const preview = input.body.length > 100 ? input.body.slice(0, 97) + "…" : input.body;
  const notification = {
    type: "message" as const,
    title: `New message from ${myOrg.organization.name}`,
    body: preview,
    link: conv.partnership_id ? `/dashboard/partnerships/${conv.partnership_id}/messages` : `/dashboard/messages/${conv.id}`,
  };
  if (conv.partnership_id) {
    const admin = createAdminClient();
    const { data: p } = await admin.from("partnerships").select("id, organization_a_id, organization_b_id").eq("id", conv.partnership_id).single();
    if (p) await notifyPartnership(p, notification, { onlyOrgId: otherOrgId, excludeUserId: ctx.userId });
  } else {
    await notifyOrg(otherOrgId, notification, { permission: "messages.direct", excludeUserId: ctx.userId });
  }
  return { id: msg!.id, duplicate: false };
}

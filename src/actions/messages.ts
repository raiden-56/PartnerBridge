"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { runAction, UserFacingError, type ActionResult } from "@/lib/actions";
import { requireOrg } from "@/lib/auth/session";
import { messageSchema } from "@/lib/validation/schemas";
import { postMessage } from "@/lib/messaging";
import { signedUrl } from "@/lib/storage";

export async function sendMessageAction(fd: FormData): Promise<ActionResult<{ id: string | null }>> {
  return runAction<{ id: string | null }>(async () => {
    const input = messageSchema.parse({ conversationId: fd.get("conversationId"), body: fd.get("body"), clientId: fd.get("clientId") || undefined });
    const files = fd.getAll("files").filter((f): f is File => f instanceof File);
    const res = await postMessage({ ...input, files });
    return { ok: true, data: { id: res.id } };
  });
}

export async function markConversationReadAction(conversationId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg();
    z.string().uuid().parse(conversationId);
    const supabase = await createClient();
    const { data: conv } = await supabase.from("conversations").select("organization_a_id, organization_b_id").eq("id", conversationId).maybeSingle();
    if (!conv) throw new UserFacingError("Conversation not found");
    const myOrg = ctx.memberships.find((m) => [conv.organization_a_id, conv.organization_b_id].includes(m.organization_id));
    if (!myOrg) throw new UserFacingError("Not a participant");
    await supabase.from("conversation_reads").upsert({ conversation_id: conversationId, user_id: ctx.userId, organization_id: myOrg.organization_id, last_read_at: new Date().toISOString() });
    return { ok: true };
  });
}

export async function messageAttachmentUrlAction(attachmentId: string): Promise<ActionResult<{ url: string }>> {
  return runAction<{ url: string }>(async () => {
    await requireOrg();
    const supabase = await createClient();
    // RLS: readable only by participants of the conversation.
    const { data } = await supabase.from("message_attachments").select("storage_path, file_name").eq("id", attachmentId).maybeSingle();
    if (!data) throw new UserFacingError("Attachment not found");
    return { ok: true, data: { url: await signedUrl("partnership-files", data.storage_path, 60, data.file_name) } };
  });
}

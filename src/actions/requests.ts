"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { addDays } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAction, dbError, UserFacingError, type ActionResult } from "@/lib/actions";
import { requireOrg } from "@/lib/auth/session";
import { requestSchema } from "@/lib/validation/schemas";
import { assertWithinLimit } from "@/lib/billing/entitlements";
import { enforceRateLimit } from "@/lib/rate-limit";
import { notifyOrg } from "@/lib/notifications/notify";
import { logActivity } from "@/lib/activity";
import { getPlatformSetting } from "@/lib/settings";
import { signedUrl, validateFile } from "@/lib/storage";
import type { FileRef, PartnershipRequest } from "@/types/db";

async function loadRequest(id: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("partnership_requests")
    .select("*, sender:organizations!partnership_requests_sender_organization_id_fkey(id, name), receiver:organizations!partnership_requests_receiver_organization_id_fkey(id, name)")
    .eq("id", id)
    .maybeSingle();
  return data as (PartnershipRequest & { sender: { id: string; name: string }; receiver: { id: string; name: string } }) | null;
}

export async function sendRequestAction(fd: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction<{ id: string }>(async () => {
    const ctx = await requireOrg("requests.manage");
    const input = requestSchema.parse({
      receiverOrganizationId: fd.get("receiverOrganizationId"),
      categoryId: fd.get("categoryId"),
      subject: fd.get("subject"),
      introduction: fd.get("introduction"),
      proposedCollaboration: fd.get("proposedCollaboration"),
      expectedBenefits: fd.get("expectedBenefits"),
      commercialModel: fd.get("commercialModel"),
      asDraft: fd.get("asDraft") === "true",
    });
    if (input.receiverOrganizationId === ctx.orgId) throw new UserFacingError("You can't send a request to your own company.");

    const admin = createAdminClient();
    const [{ data: me }, { data: target }, { data: blocked }, { data: existingPartnership }] = await Promise.all([
      admin.from("organizations").select("name, profile_status").eq("id", ctx.orgId).single(),
      admin.from("organizations").select("id, name, profile_status, open_to_partnership, deleted_at").eq("id", input.receiverOrganizationId).maybeSingle(),
      admin.from("organization_blocks").select("organization_id").eq("organization_id", input.receiverOrganizationId).eq("blocked_organization_id", ctx.orgId).maybeSingle(),
      admin
        .from("partnerships")
        .select("id")
        .eq("status", "active")
        .eq("category_id", input.categoryId)
        .or(`and(organization_a_id.eq.${ctx.orgId},organization_b_id.eq.${input.receiverOrganizationId}),and(organization_a_id.eq.${input.receiverOrganizationId},organization_b_id.eq.${ctx.orgId})`)
        .maybeSingle(),
    ]);
    if (!target || target.profile_status !== "published" || target.deleted_at) throw new UserFacingError("This company is not available.");
    if (!target.open_to_partnership) throw new UserFacingError(`${target.name} isn't accepting new partnership requests right now.`);
    if (blocked) throw new UserFacingError(`${target.name} isn't accepting requests from your company.`);
    if (existingPartnership) throw new UserFacingError("You already have an active partnership of this type with this company.");
    if (!input.asDraft && me?.profile_status !== "published") throw new UserFacingError("Publish your company profile before sending requests.");

    if (!input.asDraft) {
      await enforceRateLimit("partnership_requests_per_hour", ctx.orgId);
      await assertWithinLimit(ctx.orgId, "partnership_requests_per_month");
    }

    // Attachments (validated, stored privately; downloadable only by the two companies via signed URLs).
    const files = fd.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 3);
    files.forEach((f) => validateFile(f, "document"));
    const attachments: FileRef[] = [];
    for (const f of files) {
      const path = `${ctx.orgId}/requests/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
      const { error } = await admin.storage.from("application-files").upload(path, f, { contentType: f.type });
      if (error) throw new UserFacingError("Attachment upload failed.");
      attachments.push({ path, name: f.name, size: f.size, type: f.type });
    }

    const expiryDays = Number(await getPlatformSetting("request_expiry_days", 30)) || 30;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("partnership_requests")
      .insert({
        sender_organization_id: ctx.orgId,
        receiver_organization_id: input.receiverOrganizationId,
        category_id: input.categoryId,
        subject: input.subject,
        introduction: input.introduction,
        proposed_collaboration: input.proposedCollaboration,
        expected_benefits: input.expectedBenefits,
        commercial_model: input.commercialModel,
        attachments,
        status: input.asDraft ? "draft" : "sent",
        sent_at: input.asDraft ? null : new Date().toISOString(),
        expires_at: input.asDraft ? null : addDays(new Date(), expiryDays).toISOString(),
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new UserFacingError("You already have an open request of this type with this company.");
      if (error.code === "42501") throw new UserFacingError("You can't send a request to this company.");
      dbError(error);
    }

    if (!input.asDraft) await afterSend(data!.id, ctx.orgId, ctx.userId, me?.name ?? "A company", input.receiverOrganizationId, input.subject);
    revalidatePath("/dashboard/requests");
    return { ok: true, data: { id: data!.id }, message: input.asDraft ? "Draft saved" : `Request sent to ${target.name}` };
  });
}

async function afterSend(requestId: string, senderOrgId: string, userId: string, senderName: string, receiverOrgId: string, subject: string) {
  await logActivity({ organizationId: senderOrgId, actorId: userId, action: "request.sent", entityType: "partnership_request", entityId: requestId, summary: `Partnership request sent: ${subject}` });
  await notifyOrg(receiverOrgId, { type: "request_received", title: `New partnership request from ${senderName}`, body: subject, link: `/dashboard/requests/${requestId}` }, { permission: "requests.manage" });
}

export async function sendDraftAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg("requests.manage");
    const r = await loadRequest(id);
    if (!r || r.sender_organization_id !== ctx.orgId) throw new UserFacingError("Request not found");
    if (r.status !== "draft") throw new UserFacingError("Only drafts can be sent.");
    await enforceRateLimit("partnership_requests_per_hour", ctx.orgId);
    await assertWithinLimit(ctx.orgId, "partnership_requests_per_month");
    const expiryDays = Number(await getPlatformSetting("request_expiry_days", 30)) || 30;
    const supabase = await createClient();
    const { error } = await supabase
      .from("partnership_requests")
      .update({ status: "sent", sent_at: new Date().toISOString(), expires_at: addDays(new Date(), expiryDays).toISOString(), last_activity_at: new Date().toISOString() })
      .eq("id", id);
    if (error) dbError(error);
    await afterSend(id, ctx.orgId, ctx.userId, r.sender.name, r.receiver_organization_id, r.subject);
    revalidatePath("/dashboard/requests");
    return { ok: true, message: "Request sent" };
  });
}

export async function deleteDraftAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await requireOrg("requests.manage");
    const supabase = await createClient();
    const { error, data } = await supabase.from("partnership_requests").delete().eq("id", id).eq("status", "draft").select("id");
    if (error) dbError(error);
    if (!data?.length) throw new UserFacingError("Draft not found");
    revalidatePath("/dashboard/requests");
    return { ok: true, message: "Draft deleted" };
  });
}

/** Called when a receiver opens the request: records the "viewed" state once. */
export async function markRequestViewed(id: string) {
  try {
    const ctx = await requireOrg("requests.manage");
    const r = await loadRequest(id);
    if (!r || r.receiver_organization_id !== ctx.orgId || r.status !== "sent") return;
    const admin = createAdminClient();
    await admin.from("partnership_requests").update({ status: "viewed", viewed_at: new Date().toISOString(), last_activity_at: new Date().toISOString() }).eq("id", id).eq("status", "sent");
  } catch {
    /* non-critical */
  }
}

export async function respondToRequestAction(id: string, decision: "accept" | "reject" | "negotiate", message?: string): Promise<ActionResult<{ partnershipId?: string; conversationId?: string }>> {
  return runAction<{ partnershipId?: string; conversationId?: string }>(async () => {
    const ctx = await requireOrg("requests.manage");
    const r = await loadRequest(id);
    if (!r || r.receiver_organization_id !== ctx.orgId) throw new UserFacingError("Request not found");
    const msg = message?.trim().slice(0, 2000) || null;

    if (decision === "accept") {
      await assertWithinLimit(ctx.orgId, "active_workspaces");
      const supabase = await createClient();
      const { data: pid, error } = await supabase.rpc("accept_partnership_request", { p_request: id, p_message: msg });
      if (error) dbError(error, "Could not accept the request");
      await notifyOrg(r.sender_organization_id, {
        type: "request_accepted",
        title: `🎉 ${r.receiver.name} accepted your partnership request`,
        body: r.subject,
        link: `/dashboard/partnerships/${pid}`,
      }, { permission: "requests.manage" });
      revalidatePath("/dashboard", "layout");
      return { ok: true, data: { partnershipId: pid as string }, message: "Partnership established — your shared workspace is ready" };
    }

    if (!["sent", "viewed", "negotiation"].includes(r.status)) throw new UserFacingError(`This request is already ${r.status}.`);
    const admin = createAdminClient();

    if (decision === "reject") {
      const { error } = await admin
        .from("partnership_requests")
        .update({ status: "rejected", responded_at: new Date().toISOString(), response_message: msg, last_activity_at: new Date().toISOString() })
        .eq("id", id)
        .in("status", ["sent", "viewed", "negotiation"]);
      if (error) dbError(error);
      await logActivity({ organizationId: ctx.orgId, actorId: ctx.userId, action: "request.rejected", entityType: "partnership_request", entityId: id, summary: `Declined request: ${r.subject}` });
      await notifyOrg(r.sender_organization_id, { type: "request_rejected", title: `${r.receiver.name} declined your partnership request`, body: msg ?? r.subject, link: `/dashboard/requests/${id}` }, { permission: "requests.manage" });
      revalidatePath("/dashboard/requests");
      return { ok: true, message: "Request declined" };
    }

    // Negotiate: open/reuse a direct conversation between both companies and post the opening message.
    const [a, b] = [r.sender_organization_id, r.receiver_organization_id];
    let { data: conv } = await admin
      .from("conversations")
      .select("id")
      .eq("kind", "direct")
      .or(`and(organization_a_id.eq.${a},organization_b_id.eq.${b}),and(organization_a_id.eq.${b},organization_b_id.eq.${a})`)
      .maybeSingle();
    if (!conv) {
      const { data: created, error } = await admin
        .from("conversations")
        .insert({ kind: "direct", organization_a_id: b, organization_b_id: a, subject: `Discussion: ${r.subject}`, created_by: ctx.userId })
        .select("id")
        .single();
      if (error) dbError(error);
      conv = created;
    }
    await admin.from("partnership_messages").insert({
      conversation_id: conv!.id,
      sender_id: ctx.userId,
      sender_organization_id: ctx.orgId,
      body: msg ?? `Thanks for your request "${r.subject}". We'd like to discuss the details before deciding.`,
    });
    await admin.from("partnership_requests").update({ status: "negotiation", last_activity_at: new Date().toISOString(), response_message: msg }).eq("id", id);
    await logActivity({ organizationId: ctx.orgId, actorId: ctx.userId, action: "request.negotiation", entityType: "partnership_request", entityId: id, summary: `Started discussion on: ${r.subject}` });
    await notifyOrg(r.sender_organization_id, { type: "message", title: `${r.receiver.name} wants to discuss your request`, body: r.subject, link: `/dashboard/messages/${conv!.id}` }, { permission: "requests.manage" });
    revalidatePath("/dashboard/requests");
    return { ok: true, data: { conversationId: conv!.id }, message: "Discussion started" };
  });
}

export async function withdrawRequestAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg("requests.manage");
    const r = await loadRequest(id);
    if (!r || r.sender_organization_id !== ctx.orgId) throw new UserFacingError("Request not found");
    if (!["sent", "viewed", "negotiation"].includes(r.status)) throw new UserFacingError("Only open requests can be withdrawn.");
    const admin = createAdminClient();
    const { error } = await admin.from("partnership_requests").update({ status: "cancelled", last_activity_at: new Date().toISOString() }).eq("id", id).in("status", ["sent", "viewed", "negotiation"]);
    if (error) dbError(error);
    await logActivity({ organizationId: ctx.orgId, actorId: ctx.userId, action: "request.cancelled", entityType: "partnership_request", entityId: id, summary: `Withdrew request: ${r.subject}` });
    await notifyOrg(r.receiver_organization_id, { type: "request_rejected", title: `${r.sender.name} withdrew their partnership request`, body: r.subject, link: `/dashboard/requests/${id}` }, { permission: "requests.manage" });
    revalidatePath("/dashboard/requests");
    return { ok: true, message: "Request withdrawn" };
  });
}

export async function requestAttachmentUrlAction(requestId: string, path: string): Promise<ActionResult<{ url: string }>> {
  return runAction<{ url: string }>(async () => {
    await requireOrg("requests.manage");
    const supabase = await createClient();
    // RLS guarantees only sender/receiver companies can read this request.
    const { data } = await supabase.from("partnership_requests").select("attachments").eq("id", requestId).maybeSingle();
    const file = ((data?.attachments ?? []) as FileRef[]).find((a) => a.path === path);
    if (!file) throw new UserFacingError("File not found");
    return { ok: true, data: { url: await signedUrl("application-files", file.path, 120, file.name) } };
  });
}

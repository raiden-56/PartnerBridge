"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAction, dbError, formToObject, UserFacingError, type ActionResult } from "@/lib/actions";
import { requirePartnershipAccess } from "@/lib/auth/session";
import { agreementSchema, dealSchema, documentSchema, milestoneSchema, taskSchema } from "@/lib/validation/schemas";
import { logActivity } from "@/lib/activity";
import { notifyPartnership, notifyUsers } from "@/lib/notifications/notify";
import { assertWithinLimit } from "@/lib/billing/entitlements";
import { signedUrl, uploadFile, validateFile } from "@/lib/storage";

const path = (pid: string, sub = "") => `/dashboard/partnerships/${pid}${sub}`;

async function timeline(pid: string, orgId: string, userId: string, action: string, summary: string, entityType?: string, entityId?: string | null) {
  await logActivity({ partnershipId: pid, organizationId: orgId, actorId: userId, action, summary, entityType, entityId });
}

/** Members of the two companies (for validating task assignees). */
async function assertAssignable(pid: string, userId: string | null, orgs: string[]) {
  if (!userId) return;
  const admin = createAdminClient();
  const { data } = await admin.from("organization_members").select("user_id").eq("user_id", userId).in("organization_id", orgs).limit(1);
  if (!data?.length) throw new UserFacingError("Assignee must be a member of one of the partner companies.");
}

// ─── Partnership settings ──────────────────────────────────────────────
export async function updatePartnershipAction(pid: string, raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { ctx, myOrgId } = await requirePartnershipAccess(pid);
    const input = z.object({ title: z.string().trim().min(3).max(160), objectives: z.string().trim().max(4000).optional() }).parse(raw);
    const supabase = await createClient();
    const { error } = await supabase.from("partnerships").update({ title: input.title, objectives: input.objectives || null }).eq("id", pid);
    if (error) dbError(error);
    await timeline(pid, myOrgId, ctx.userId, "partnership.updated", "Partnership objectives updated");
    revalidatePath(path(pid), "layout");
    return { ok: true, message: "Partnership updated" };
  });
}

export async function changePartnershipStatusAction(pid: string, status: "active" | "paused" | "ended"): Promise<ActionResult> {
  return runAction(async () => {
    const { ctx, myOrgId, partnership } = await requirePartnershipAccess(pid);
    if (!ctx.can("workspaces.all")) throw new UserFacingError("Only partnership managers or admins can change the partnership status.");
    if (partnership.status === "ended") throw new UserFacingError("This partnership has ended.");
    if (status === "active" && partnership.status !== "active") await assertWithinLimit(myOrgId, "active_workspaces");
    const supabase = await createClient();
    const { error } = await supabase
      .from("partnerships")
      .update({ status, ...(status === "ended" ? { ended_at: new Date().toISOString() } : {}) })
      .eq("id", pid);
    if (error) dbError(error);
    await timeline(pid, myOrgId, ctx.userId, "partnership.status", `Partnership status changed to ${status}`);
    await notifyPartnership(partnership, { type: "agreement", title: `Partnership ${status === "ended" ? "ended" : status}`, body: partnership.title, link: path(pid) }, { excludeUserId: ctx.userId });
    revalidatePath(path(pid), "layout");
    return { ok: true, message: `Partnership ${status}` };
  });
}

export async function setWorkspaceMemberAction(pid: string, userId: string, op: "add" | "remove" | "primary"): Promise<ActionResult> {
  return runAction(async () => {
    const { ctx, myOrgId } = await requirePartnershipAccess(pid);
    if (!ctx.can("workspaces.all")) throw new UserFacingError("Only managers or admins can manage workspace members.");
    const admin = createAdminClient();
    const { data: m } = await admin.from("organization_members").select("user_id").eq("organization_id", myOrgId).eq("user_id", userId).maybeSingle();
    if (!m) throw new UserFacingError("You can only manage members of your own company.");
    const supabase = await createClient();
    if (op === "remove") {
      const { error } = await supabase.from("partnership_members").delete().eq("partnership_id", pid).eq("user_id", userId).eq("organization_id", myOrgId);
      if (error) dbError(error);
    } else {
      if (op === "primary") {
        await supabase.from("partnership_members").update({ is_primary_contact: false }).eq("partnership_id", pid).eq("organization_id", myOrgId);
      }
      const { error } = await supabase
        .from("partnership_members")
        .upsert({ partnership_id: pid, organization_id: myOrgId, user_id: userId, is_primary_contact: op === "primary", added_by: ctx.userId }, { onConflict: "partnership_id,user_id" });
      if (error) dbError(error);
      if (op === "add") await notifyUsers([userId], { type: "team", title: "You were added to a partnership workspace", link: path(pid) });
    }
    revalidatePath(path(pid, "/team"));
    return { ok: true, message: op === "primary" ? "Primary contact updated" : op === "add" ? "Member added" : "Member removed" };
  });
}

// ─── Tasks ─────────────────────────────────────────────────────────────
export async function saveTaskAction(pid: string, taskId: string | null, raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { ctx, myOrgId, partnership, otherOrgId } = await requirePartnershipAccess(pid);
    const input = taskSchema.parse(raw);
    if (input.responsibleOrganizationId && ![myOrgId, otherOrgId].includes(input.responsibleOrganizationId)) throw new UserFacingError("Invalid responsible company");
    await assertAssignable(pid, input.assigneeId, [myOrgId, otherOrgId]);
    const supabase = await createClient();
    const row = {
      title: input.title,
      description: input.description,
      responsible_organization_id: input.responsibleOrganizationId,
      assignee_id: input.assigneeId,
      due_date: input.dueDate,
      priority: input.priority,
      status: input.status,
      completed_at: input.status === "done" ? new Date().toISOString() : null,
    };
    let previousAssignee: string | null = null;
    if (taskId) {
      const { data: prev } = await supabase.from("partnership_tasks").select("assignee_id, status").eq("id", taskId).eq("partnership_id", pid).single();
      if (!prev) throw new UserFacingError("Task not found");
      previousAssignee = prev.assignee_id;
      const { error } = await supabase.from("partnership_tasks").update(row).eq("id", taskId).eq("partnership_id", pid);
      if (error) dbError(error);
      if (prev.status !== input.status) await timeline(pid, myOrgId, ctx.userId, "task.status", `Task "${input.title}" moved to ${input.status.replace("_", " ")}`, "task", taskId);
    } else {
      const { data, error } = await supabase.from("partnership_tasks").insert({ ...row, partnership_id: pid, created_by: ctx.userId }).select("id").single();
      if (error) dbError(error);
      taskId = data!.id;
      await timeline(pid, myOrgId, ctx.userId, "task.created", `Task created: ${input.title}`, "task", taskId);
    }
    if (input.assigneeId && input.assigneeId !== previousAssignee && input.assigneeId !== ctx.userId) {
      await notifyUsers([input.assigneeId], { type: "task_assigned", title: `New task assigned: ${input.title}`, body: partnership.title, link: path(pid, "/tasks") });
    }
    revalidatePath(path(pid, "/tasks"));
    return { ok: true, message: "Task saved" };
  });
}

export async function setTaskStatusAction(pid: string, taskId: string, status: "todo" | "in_progress" | "blocked" | "done"): Promise<ActionResult> {
  return runAction(async () => {
    const { ctx, myOrgId } = await requirePartnershipAccess(pid);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("partnership_tasks")
      .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
      .eq("id", taskId)
      .eq("partnership_id", pid)
      .select("title")
      .single();
    if (error) dbError(error);
    await timeline(pid, myOrgId, ctx.userId, "task.status", `Task "${data!.title}" moved to ${status.replace("_", " ")}`, "task", taskId);
    revalidatePath(path(pid, "/tasks"));
    return { ok: true };
  });
}

export async function deleteTaskAction(pid: string, taskId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { ctx, myOrgId } = await requirePartnershipAccess(pid);
    const supabase = await createClient();
    const { data, error } = await supabase.from("partnership_tasks").update({ deleted_at: new Date().toISOString() }).eq("id", taskId).eq("partnership_id", pid).select("title").single();
    if (error) dbError(error);
    await timeline(pid, myOrgId, ctx.userId, "task.deleted", `Task deleted: ${data!.title}`, "task", taskId);
    revalidatePath(path(pid, "/tasks"));
    return { ok: true, message: "Task deleted" };
  });
}

export async function addTaskCommentAction(pid: string, taskId: string, body: string): Promise<ActionResult> {
  return runAction(async () => {
    const { ctx } = await requirePartnershipAccess(pid);
    const text = z.string().trim().min(1).max(4000).parse(body);
    const supabase = await createClient();
    const { error } = await supabase.from("task_comments").insert({ task_id: taskId, partnership_id: pid, author_id: ctx.userId, body: text });
    if (error) dbError(error);
    revalidatePath(path(pid, "/tasks"));
    return { ok: true };
  });
}

// ─── Milestones ────────────────────────────────────────────────────────
export async function saveMilestoneAction(pid: string, id: string | null, raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { ctx, myOrgId, partnership } = await requirePartnershipAccess(pid);
    const input = milestoneSchema.parse(raw);
    const status = input.progress === 100 ? "completed" : input.status;
    const supabase = await createClient();
    const row = {
      title: input.title,
      description: input.description,
      target_date: input.targetDate,
      progress: status === "completed" ? 100 : input.progress,
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    };
    if (id) {
      const { data: prev } = await supabase.from("partnership_milestones").select("status").eq("id", id).eq("partnership_id", pid).single();
      if (!prev) throw new UserFacingError("Milestone not found");
      const { error } = await supabase.from("partnership_milestones").update(row).eq("id", id);
      if (error) dbError(error);
      if (prev.status !== "completed" && status === "completed") {
        await timeline(pid, myOrgId, ctx.userId, "milestone.completed", `Milestone completed: ${input.title} 🎯`, "milestone", id);
        await notifyPartnership(partnership, { type: "milestone_due", title: `Milestone completed: ${input.title}`, link: path(pid, "/milestones") }, { excludeUserId: ctx.userId });
      } else await timeline(pid, myOrgId, ctx.userId, "milestone.updated", `Milestone "${input.title}" updated (${row.progress}%)`, "milestone", id);
    } else {
      const { data, error } = await supabase.from("partnership_milestones").insert({ ...row, partnership_id: pid, created_by: ctx.userId }).select("id").single();
      if (error) dbError(error);
      await timeline(pid, myOrgId, ctx.userId, "milestone.created", `Milestone created: ${input.title}`, "milestone", data!.id);
    }
    revalidatePath(path(pid, "/milestones"));
    return { ok: true, message: "Milestone saved" };
  });
}

export async function deleteMilestoneAction(pid: string, id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { ctx, myOrgId } = await requirePartnershipAccess(pid);
    const supabase = await createClient();
    const { data, error } = await supabase.from("partnership_milestones").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("partnership_id", pid).select("title").single();
    if (error) dbError(error);
    await timeline(pid, myOrgId, ctx.userId, "milestone.deleted", `Milestone deleted: ${data!.title}`, "milestone", id);
    revalidatePath(path(pid, "/milestones"));
    return { ok: true, message: "Milestone deleted" };
  });
}

// ─── Documents ─────────────────────────────────────────────────────────
export async function uploadDocumentAction(pid: string, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { ctx, myOrgId, partnership } = await requirePartnershipAccess(pid);
    const input = documentSchema.parse(formToObject(fd));
    const file = fd.get("file");
    if (!(file instanceof File)) throw new UserFacingError("Choose a file to upload.");
    validateFile(file, "document");
    await assertWithinLimit(myOrgId, "storage_mb", Math.ceil(file.size / 1024 / 1024));
    const supabase = await createClient();
    const ref = await uploadFile(supabase, "partnership-files", `p/${pid}`, file);
    const { data, error } = await supabase
      .from("partnership_documents")
      .insert({
        partnership_id: pid,
        owner_organization_id: myOrgId,
        title: input.title,
        category: input.category,
        access_level: input.accessLevel,
        storage_path: ref.path,
        file_name: ref.name,
        mime_type: ref.type,
        size_bytes: ref.size,
        uploaded_by: ctx.userId,
      })
      .select("id")
      .single();
    if (error) dbError(error);
    await supabase.from("document_versions").insert({ document_id: data!.id, partnership_id: pid, version: 1, storage_path: ref.path, file_name: ref.name, mime_type: ref.type, size_bytes: ref.size, uploaded_by: ctx.userId, change_note: "Initial upload" });
    await createAdminClient().from("document_access_logs").insert({ document_id: data!.id, partnership_id: pid, user_id: ctx.userId, organization_id: myOrgId, action: "upload", version: 1 });
    if (input.accessLevel === "shared") {
      await timeline(pid, myOrgId, ctx.userId, "document.uploaded", `Document uploaded: ${input.title}`, "document", data!.id);
      await notifyPartnership(partnership, { type: "agreement", title: `New document shared: ${input.title}`, link: path(pid, "/documents") }, { excludeUserId: ctx.userId });
    }
    revalidatePath(path(pid, "/documents"));
    return { ok: true, message: "Document uploaded" };
  });
}

export async function uploadDocumentVersionAction(pid: string, documentId: string, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { ctx, myOrgId } = await requirePartnershipAccess(pid);
    const file = fd.get("file");
    if (!(file instanceof File)) throw new UserFacingError("Choose a file to upload.");
    validateFile(file, "document");
    const note = String(fd.get("changeNote") ?? "").slice(0, 500) || null;
    const supabase = await createClient();
    const { data: doc } = await supabase.from("partnership_documents").select("id, title, current_version, owner_organization_id, access_level").eq("id", documentId).eq("partnership_id", pid).is("deleted_at", null).single();
    if (!doc) throw new UserFacingError("Document not found");
    if (doc.owner_organization_id !== myOrgId) throw new UserFacingError("Only the company that owns this document can upload new versions.");
    const ref = await uploadFile(supabase, "partnership-files", `p/${pid}`, file);
    const version = doc.current_version + 1;
    const { error: vErr } = await supabase.from("document_versions").insert({ document_id: documentId, partnership_id: pid, version, storage_path: ref.path, file_name: ref.name, mime_type: ref.type, size_bytes: ref.size, uploaded_by: ctx.userId, change_note: note });
    if (vErr) dbError(vErr);
    const { error } = await supabase.from("partnership_documents").update({ current_version: version, storage_path: ref.path, file_name: ref.name, mime_type: ref.type, size_bytes: ref.size }).eq("id", documentId);
    if (error) dbError(error);
    await createAdminClient().from("document_access_logs").insert({ document_id: documentId, partnership_id: pid, user_id: ctx.userId, organization_id: myOrgId, action: "new_version", version });
    if (doc.access_level === "shared") await timeline(pid, myOrgId, ctx.userId, "document.version", `New version (v${version}) of "${doc.title}"`, "document", documentId);
    revalidatePath(path(pid, "/documents"));
    return { ok: true, message: `Version ${version} uploaded` };
  });
}

export async function documentDownloadUrlAction(pid: string, documentId: string, version?: number): Promise<ActionResult<{ url: string }>> {
  return runAction<{ url: string }>(async () => {
    const { ctx, myOrgId } = await requirePartnershipAccess(pid);
    const supabase = await createClient();
    // RLS hides 'internal' documents of the other company — a null result means no access.
    const { data: doc } = await supabase.from("partnership_documents").select("id, file_name, storage_path, current_version").eq("id", documentId).eq("partnership_id", pid).is("deleted_at", null).maybeSingle();
    if (!doc) throw new UserFacingError("Document not found");
    let target = { path: doc.storage_path as string, name: doc.file_name as string, v: doc.current_version as number };
    if (version && version !== doc.current_version) {
      const { data: v } = await supabase.from("document_versions").select("storage_path, file_name, version").eq("document_id", documentId).eq("version", version).single();
      if (!v) throw new UserFacingError("Version not found");
      target = { path: v.storage_path, name: v.file_name, v: v.version };
    }
    await createAdminClient().from("document_access_logs").insert({ document_id: documentId, partnership_id: pid, user_id: ctx.userId, organization_id: myOrgId, action: "download", version: target.v });
    return { ok: true, data: { url: await signedUrl("partnership-files", target.path, 60, target.name) } };
  });
}

export async function updateDocumentAccessAction(pid: string, documentId: string, accessLevel: "shared" | "internal"): Promise<ActionResult> {
  return runAction(async () => {
    const { ctx, myOrgId } = await requirePartnershipAccess(pid);
    const supabase = await createClient();
    const { data, error } = await supabase.from("partnership_documents").update({ access_level: accessLevel }).eq("id", documentId).eq("owner_organization_id", myOrgId).select("title");
    if (error) dbError(error);
    if (!data?.length) throw new UserFacingError("Only the owning company can change access.");
    await createAdminClient().from("document_access_logs").insert({ document_id: documentId, partnership_id: pid, user_id: ctx.userId, organization_id: myOrgId, action: "access_change" });
    revalidatePath(path(pid, "/documents"));
    return { ok: true, message: accessLevel === "shared" ? "Now shared with your partner" : "Now internal to your company" };
  });
}

export async function deleteDocumentAction(pid: string, documentId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { ctx, myOrgId } = await requirePartnershipAccess(pid);
    const supabase = await createClient();
    const { data, error } = await supabase.from("partnership_documents").update({ deleted_at: new Date().toISOString() }).eq("id", documentId).eq("owner_organization_id", myOrgId).select("title");
    if (error) dbError(error);
    if (!data?.length) throw new UserFacingError("Only the owning company can delete this document.");
    await createAdminClient().from("document_access_logs").insert({ document_id: documentId, partnership_id: pid, user_id: ctx.userId, organization_id: myOrgId, action: "delete" });
    await timeline(pid, myOrgId, ctx.userId, "document.deleted", `Document removed: ${data[0]!.title}`, "document", documentId);
    revalidatePath(path(pid, "/documents"));
    return { ok: true, message: "Document deleted" };
  });
}

// ─── Agreements ────────────────────────────────────────────────────────
export async function saveAgreementAction(pid: string, agreementId: string | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { ctx, myOrgId, partnership } = await requirePartnershipAccess(pid);
    const input = agreementSchema.parse(formToObject(fd));
    const file = fd.get("file");
    const supabase = await createClient();
    let ref: { path: string; name: string } | null = null;
    if (file instanceof File && file.size > 0) {
      validateFile(file, "document");
      if (file.type !== "application/pdf") throw new UserFacingError("Agreements must be uploaded as PDF.");
      ref = await uploadFile(supabase, "partnership-files", `p/${pid}`, file);
    }
    const admin = createAdminClient();
    if (!agreementId) {
      const { data, error } = await supabase
        .from("partnership_agreements")
        .insert({
          partnership_id: pid,
          title: input.title,
          agreement_type: input.agreementType,
          commercial_terms: input.commercialTerms,
          effective_date: input.effectiveDate,
          expiration_date: input.expirationDate,
          renewal_date: input.renewalDate,
          storage_path: ref?.path ?? null,
          file_name: ref?.name ?? null,
          created_by: ctx.userId,
        })
        .select("id")
        .single();
      if (error) dbError(error);
      await admin.from("agreement_versions").insert({ agreement_id: data!.id, partnership_id: pid, version: 1, commercial_terms: input.commercialTerms, storage_path: ref?.path ?? null, file_name: ref?.name ?? null, change_note: input.changeNote ?? "Initial draft", created_by: ctx.userId });
      await timeline(pid, myOrgId, ctx.userId, "agreement.created", `Agreement record created: ${input.title}`, "agreement", data!.id);
      await notifyPartnership(partnership, { type: "agreement", title: `New agreement draft: ${input.title}`, link: path(pid, "/agreements") }, { excludeUserId: ctx.userId });
    } else {
      // Edits go through the service client so we can reset approvals: any change invalidates prior approvals.
      const { data: prev } = await supabase.from("partnership_agreements").select("current_version, status, storage_path, file_name").eq("id", agreementId).eq("partnership_id", pid).single();
      if (!prev) throw new UserFacingError("Agreement not found");
      if (["active", "terminated", "expired"].includes(prev.status)) throw new UserFacingError("Active, expired or terminated agreements can't be edited. Create a new version via a new agreement record.");
      const version = prev.current_version + 1;
      const { error } = await admin
        .from("partnership_agreements")
        .update({
          title: input.title,
          agreement_type: input.agreementType,
          commercial_terms: input.commercialTerms,
          effective_date: input.effectiveDate,
          expiration_date: input.expirationDate,
          renewal_date: input.renewalDate,
          current_version: version,
          storage_path: ref?.path ?? prev.storage_path,
          file_name: ref?.name ?? prev.file_name,
          status: "under_review",
          approval_a_by: null,
          approval_a_at: null,
          approval_b_by: null,
          approval_b_at: null,
        })
        .eq("id", agreementId);
      if (error) dbError(error);
      await admin.from("agreement_versions").insert({ agreement_id: agreementId, partnership_id: pid, version, commercial_terms: input.commercialTerms, storage_path: ref?.path ?? prev.storage_path, file_name: ref?.name ?? prev.file_name, change_note: input.changeNote, created_by: ctx.userId });
      await timeline(pid, myOrgId, ctx.userId, "agreement.updated", `Agreement "${input.title}" updated to v${version} — approvals reset`, "agreement", agreementId);
      await notifyPartnership(partnership, { type: "agreement", title: `Agreement updated: ${input.title} (v${version})`, body: "Please review and approve the new version.", link: path(pid, "/agreements") }, { excludeUserId: ctx.userId });
    }
    revalidatePath(path(pid, "/agreements"));
    return { ok: true, message: "Agreement saved" };
  });
}

/**
 * Records internal approval by the caller's company. This is NOT a legally binding e-signature.
 * When both companies approve the agreement becomes "approved"; activation is a separate step.
 */
export async function approveAgreementAction(pid: string, agreementId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { ctx, myOrgId, partnership } = await requirePartnershipAccess(pid);
    if (!ctx.can("workspaces.all")) throw new UserFacingError("Only partnership managers, admins or owners can approve agreements.");
    const admin = createAdminClient();
    const { data: ag } = await admin.from("partnership_agreements").select("*").eq("id", agreementId).eq("partnership_id", pid).is("deleted_at", null).single();
    if (!ag) throw new UserFacingError("Agreement not found");
    if (!["draft", "under_review"].includes(ag.status)) throw new UserFacingError("This agreement is not awaiting approval.");
    const side = myOrgId === partnership.organization_a_id ? "a" : "b";
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = side === "a" ? { approval_a_by: ctx.userId, approval_a_at: now } : { approval_b_by: ctx.userId, approval_b_at: now };
    const bothApproved = side === "a" ? !!ag.approval_b_at : !!ag.approval_a_at;
    patch.status = bothApproved ? "approved" : "under_review";
    const { error } = await admin.from("partnership_agreements").update(patch).eq("id", agreementId);
    if (error) dbError(error);
    await timeline(pid, myOrgId, ctx.userId, "agreement.approved", `${ctx.membership.organization.name} approved "${ag.title}" (v${ag.current_version})${bothApproved ? " — approved by both companies" : ""}`, "agreement", agreementId);
    await notifyPartnership(partnership, { type: "agreement", title: bothApproved ? `Agreement approved by both companies: ${ag.title}` : `${ctx.membership.organization.name} approved ${ag.title}`, link: path(pid, "/agreements") }, { excludeUserId: ctx.userId });
    revalidatePath(path(pid, "/agreements"));
    return { ok: true, message: bothApproved ? "Approved by both companies" : "Your company's approval was recorded" };
  });
}

export async function setAgreementStatusAction(pid: string, agreementId: string, status: "active" | "terminated" | "expired"): Promise<ActionResult> {
  return runAction(async () => {
    const { ctx, myOrgId, partnership } = await requirePartnershipAccess(pid);
    if (!ctx.can("workspaces.all")) throw new UserFacingError("Only partnership managers, admins or owners can change agreement status.");
    const admin = createAdminClient();
    const { data: ag } = await admin.from("partnership_agreements").select("status, title").eq("id", agreementId).eq("partnership_id", pid).single();
    if (!ag) throw new UserFacingError("Agreement not found");
    if (status === "active" && ag.status !== "approved") throw new UserFacingError("Both companies must approve before the agreement can be marked active.");
    const { error } = await admin.from("partnership_agreements").update({ status }).eq("id", agreementId);
    if (error) dbError(error);
    await timeline(pid, myOrgId, ctx.userId, "agreement.status", `Agreement "${ag.title}" marked ${status}`, "agreement", agreementId);
    await notifyPartnership(partnership, { type: "agreement", title: `Agreement ${status}: ${ag.title}`, link: path(pid, "/agreements") }, { excludeUserId: ctx.userId });
    revalidatePath(path(pid, "/agreements"));
    return { ok: true, message: `Agreement ${status}` };
  });
}

export async function agreementFileUrlAction(pid: string, agreementId: string, version?: number): Promise<ActionResult<{ url: string }>> {
  return runAction<{ url: string }>(async () => {
    await requirePartnershipAccess(pid);
    const supabase = await createClient();
    const q = version
      ? supabase.from("agreement_versions").select("storage_path, file_name").eq("agreement_id", agreementId).eq("version", version).single()
      : supabase.from("partnership_agreements").select("storage_path, file_name").eq("id", agreementId).eq("partnership_id", pid).single();
    const { data } = await q;
    if (!data?.storage_path) throw new UserFacingError("No file attached");
    return { ok: true, data: { url: await signedUrl("partnership-files", data.storage_path, 60, data.file_name ?? "agreement.pdf") } };
  });
}

// ─── Deals & referrals ─────────────────────────────────────────────────
export async function saveDealAction(pid: string, dealId: string | null, raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { ctx, myOrgId, otherOrgId, partnership } = await requirePartnershipAccess(pid);
    const input = dealSchema.parse(raw);
    const orgs = [myOrgId, otherOrgId];
    if (!orgs.includes(input.ownerOrganizationId)) throw new UserFacingError("Deal owner must be one of the partner companies.");
    if (input.referralSourceOrganizationId && !orgs.includes(input.referralSourceOrganizationId)) throw new UserFacingError("Referral source must be one of the partner companies.");
    const supabase = await createClient();
    const admin = createAdminClient();
    const base = {
      title: input.title,
      customer_name: input.customerName,
      customer_company: input.customerCompany,
      customer_email: input.customerEmail,
      owner_organization_id: input.ownerOrganizationId,
      referral_source_organization_id: input.referralSourceOrganizationId,
      stage: input.stage,
      expected_value: input.expectedValue,
      attributed_revenue: input.attributedRevenue ?? null,
      expected_close_date: input.expectedCloseDate,
      notes: input.notes,
      closed_at: ["won", "lost"].includes(input.stage) ? new Date().toISOString() : null,
    };
    if (!dealId) {
      const { data, error } = await supabase.from("partnership_deals").insert({ ...base, partnership_id: pid, owner_user_id: ctx.userId, created_by: ctx.userId }).select("id").single();
      if (error) dbError(error);
      dealId = data!.id;
      if (input.referralSourceOrganizationId && input.referralSourceOrganizationId !== input.ownerOrganizationId) {
        await admin.from("referrals").insert({
          partnership_id: pid,
          deal_id: dealId,
          from_organization_id: input.referralSourceOrganizationId,
          to_organization_id: input.ownerOrganizationId,
          lead_name: input.customerCompany ?? input.customerName,
          status: input.stage === "won" ? "converted" : input.stage === "lost" ? "lost" : "open",
          created_by: ctx.userId,
        });
      }
      await timeline(pid, myOrgId, ctx.userId, "deal.registered", `Deal registered: ${input.title}`, "deal", dealId);
      await notifyPartnership(partnership, { type: "deal", title: `New deal registered: ${input.title}`, link: path(pid, "/deals") }, { excludeUserId: ctx.userId });
    } else {
      const { data: prev } = await admin.from("partnership_deals").select("stage, owner_organization_id, verified_at").eq("id", dealId).eq("partnership_id", pid).single();
      if (!prev) throw new UserFacingError("Deal not found");
      // Revenue verified by the counterpart is locked from further revenue edits by the owner.
      const patch = prev.verified_at ? { ...base, attributed_revenue: undefined } : base;
      const { error } = await admin.from("partnership_deals").update(patch).eq("id", dealId);
      if (error) dbError(error);
      await admin.from("referrals").update({ status: input.stage === "won" ? "converted" : input.stage === "lost" ? "lost" : "open" }).eq("deal_id", dealId);
      if (prev.stage !== input.stage) {
        await timeline(pid, myOrgId, ctx.userId, "deal.stage", `Deal "${input.title}" moved to ${input.stage}`, "deal", dealId);
        if (input.stage === "won") await notifyPartnership(partnership, { type: "deal", title: `🎉 Deal won: ${input.title}`, link: path(pid, "/deals") }, { excludeUserId: ctx.userId });
      }
    }
    revalidatePath(path(pid, "/deals"));
    return { ok: true, message: "Deal saved" };
  });
}

/** The counterpart company (not the deal owner) confirms actual revenue → "verified revenue". */
export async function verifyDealRevenueAction(pid: string, dealId: string, amount: number): Promise<ActionResult> {
  return runAction(async () => {
    const { ctx, myOrgId, partnership } = await requirePartnershipAccess(pid);
    if (!ctx.can("workspaces.all")) throw new UserFacingError("Only managers or admins can verify revenue.");
    const value = z.coerce.number().min(0).max(1e12).parse(amount);
    const admin = createAdminClient();
    const { data: deal } = await admin.from("partnership_deals").select("title, stage, owner_organization_id").eq("id", dealId).eq("partnership_id", pid).single();
    if (!deal) throw new UserFacingError("Deal not found");
    if (deal.stage !== "won") throw new UserFacingError("Only won deals can have verified revenue.");
    if (deal.owner_organization_id === myOrgId) throw new UserFacingError("Revenue must be verified by the partner company, not the deal owner.");
    const { error } = await admin.from("partnership_deals").update({ verified_revenue: value, verified_by: ctx.userId, verified_at: new Date().toISOString() }).eq("id", dealId);
    if (error) dbError(error);
    await timeline(pid, myOrgId, ctx.userId, "deal.verified", `Revenue verified for "${deal.title}"`, "deal", dealId);
    await notifyPartnership(partnership, { type: "deal", title: `Revenue verified: ${deal.title}`, link: path(pid, "/deals") }, { excludeUserId: ctx.userId });
    revalidatePath(path(pid, "/deals"));
    return { ok: true, message: "Revenue verified" };
  });
}

export async function deleteDealAction(pid: string, dealId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { ctx, myOrgId } = await requirePartnershipAccess(pid);
    const admin = createAdminClient();
    const { data, error } = await admin.from("partnership_deals").update({ deleted_at: new Date().toISOString() }).eq("id", dealId).eq("partnership_id", pid).eq("owner_organization_id", myOrgId).select("title");
    if (error) dbError(error);
    if (!data?.length) throw new UserFacingError("Only the deal owner's company can delete it.");
    await timeline(pid, myOrgId, ctx.userId, "deal.deleted", `Deal removed: ${data[0]!.title}`, "deal", dealId);
    revalidatePath(path(pid, "/deals"));
    return { ok: true, message: "Deal deleted" };
  });
}

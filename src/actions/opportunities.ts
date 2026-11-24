"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAction, dbError, UserFacingError, type ActionResult } from "@/lib/actions";
import { requireOrg } from "@/lib/auth/session";
import { applicationSchema, opportunitySchema } from "@/lib/validation/schemas";
import { assertWithinLimit } from "@/lib/billing/entitlements";
import { enforceRateLimit } from "@/lib/rate-limit";
import { notifyOrg } from "@/lib/notifications/notify";
import { logActivity } from "@/lib/activity";
import { uploadFile, validateFile } from "@/lib/storage";
import type { ApplicationStatus, OpportunityStatus } from "@/types/db";

export async function saveOpportunityAction(id: string | null, raw: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction<{ id: string }>(async () => {
    const ctx = await requireOrg("opportunities.manage");
    const input = opportunitySchema.parse(raw);
    const supabase = await createClient();

    const { data: org } = await supabase.from("organizations").select("profile_status").eq("id", ctx.orgId).single();
    if (input.publish && org?.profile_status !== "published") throw new UserFacingError("Publish your company profile before publishing opportunities.");

    const row = {
      organization_id: ctx.orgId,
      category_id: input.categoryId,
      title: input.title,
      description: input.description,
      required_capabilities: input.requiredCapabilities,
      preferred_industry_ids: input.preferredIndustryIds,
      target_locations: input.targetLocations,
      expected_partner_size: input.expectedPartnerSize ?? null,
      commercial_model: input.commercialModel,
      duration: input.duration,
      requirements: input.requirements,
      benefits: input.benefits,
      deadline: input.deadline,
      visibility: input.visibility,
    };

    if (id) {
      const { data: existing } = await supabase.from("partnership_opportunities").select("status, organization_id").eq("id", id).single();
      if (!existing || existing.organization_id !== ctx.orgId) throw new UserFacingError("Opportunity not found");
      const publishNow = input.publish && existing.status === "draft";
      if (publishNow) await assertWithinLimit(ctx.orgId, "active_opportunities");
      const { error } = await supabase
        .from("partnership_opportunities")
        .update({ ...row, ...(publishNow ? { status: "published", published_at: new Date().toISOString() } : {}) })
        .eq("id", id);
      if (error) dbError(error);
      revalidatePath("/dashboard/opportunities");
      return { ok: true, data: { id }, message: "Opportunity updated" };
    }

    if (input.publish) await assertWithinLimit(ctx.orgId, "active_opportunities");
    const { data, error } = await supabase
      .from("partnership_opportunities")
      .insert({ ...row, status: input.publish ? "published" : "draft", published_at: input.publish ? new Date().toISOString() : null, created_by: ctx.userId })
      .select("id")
      .single();
    if (error) dbError(error);
    await logActivity({ organizationId: ctx.orgId, actorId: ctx.userId, action: "opportunity.created", entityType: "opportunity", entityId: data!.id, summary: `Opportunity "${input.title}" ${input.publish ? "published" : "drafted"}` });
    revalidatePath("/dashboard/opportunities");
    revalidatePath("/opportunities");
    return { ok: true, data: { id: data!.id }, message: input.publish ? "Opportunity published" : "Draft saved" };
  });
}

const TRANSITIONS: Record<string, OpportunityStatus[]> = {
  publish: ["draft", "paused"],
  pause: ["published"],
  close: ["published", "paused", "draft"],
  unpublish: ["published", "paused"],
};

export async function changeOpportunityStatusAction(id: string, op: "publish" | "pause" | "close" | "unpublish" | "toggle_applications"): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg("opportunities.manage");
    const supabase = await createClient();
    const { data: opp } = await supabase.from("partnership_opportunities").select("id, status, organization_id, accepting_applications, title").eq("id", id).single();
    if (!opp || opp.organization_id !== ctx.orgId) throw new UserFacingError("Opportunity not found");

    if (op === "toggle_applications") {
      const { error } = await supabase.from("partnership_opportunities").update({ accepting_applications: !opp.accepting_applications }).eq("id", id);
      if (error) dbError(error);
      revalidatePath(`/dashboard/opportunities/${id}`);
      return { ok: true, message: opp.accepting_applications ? "Applications paused" : "Applications reopened" };
    }
    if (!TRANSITIONS[op]!.includes(opp.status)) throw new UserFacingError(`Cannot ${op} an opportunity that is ${opp.status}.`);
    if (op === "publish") {
      await assertWithinLimit(ctx.orgId, "active_opportunities", opp.status === "paused" ? 0 : 1);
    }
    const status: OpportunityStatus = op === "publish" ? "published" : op === "pause" ? "paused" : op === "close" ? "closed" : "draft";
    const { error } = await supabase
      .from("partnership_opportunities")
      .update({ status, ...(op === "publish" ? { published_at: new Date().toISOString() } : {}) })
      .eq("id", id);
    if (error) dbError(error);
    await logActivity({ organizationId: ctx.orgId, actorId: ctx.userId, action: `opportunity.${op}`, entityType: "opportunity", entityId: id, summary: `Opportunity "${opp.title}" ${status}` });
    revalidatePath("/dashboard/opportunities");
    revalidatePath(`/dashboard/opportunities/${id}`);
    revalidatePath("/opportunities");
    return { ok: true, message: `Opportunity ${status}` };
  });
}

export async function deleteOpportunityAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg("opportunities.manage");
    const supabase = await createClient();
    const { error, data } = await supabase
      .from("partnership_opportunities")
      .update({ deleted_at: new Date().toISOString(), status: "closed" })
      .eq("id", id)
      .eq("organization_id", ctx.orgId)
      .select("id");
    if (error) dbError(error);
    if (!data?.length) throw new UserFacingError("Opportunity not found");
    revalidatePath("/dashboard/opportunities");
    return { ok: true, message: "Opportunity deleted" };
  });
}

// ─── Applications (applicant side) ─────────────────────────────────────
export async function applyToOpportunityAction(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg("applications.manage");
    const input = applicationSchema.parse({ opportunityId: fd.get("opportunityId"), proposal: fd.get("proposal"), capabilities: fd.get("capabilities") });
    await enforceRateLimit("applications_per_hour", ctx.orgId);

    const supabase = await createClient();
    const { data: me } = await supabase.from("organizations").select("profile_status, name").eq("id", ctx.orgId).single();
    if (me?.profile_status !== "published") throw new UserFacingError("Publish your company profile before applying to opportunities.");
    const { data: opp } = await supabase.from("partnership_opportunities").select("id, title, organization_id, status, accepting_applications, deadline, visibility").eq("id", input.opportunityId).single();
    if (!opp) throw new UserFacingError("Opportunity not found");
    if (opp.organization_id === ctx.orgId) throw new UserFacingError("You can't apply to your own opportunity.");
    if (opp.status !== "published" || !opp.accepting_applications) throw new UserFacingError("This opportunity is not accepting applications.");
    if (opp.deadline && new Date(opp.deadline) < new Date(new Date().toDateString())) throw new UserFacingError("The application deadline has passed.");

    await assertWithinLimit(ctx.orgId, "applications_per_month");

    const files = fd.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 3);
    files.forEach((f) => validateFile(f, "document"));
    const attachments = [];
    for (const f of files) attachments.push(await uploadFile(supabase, "application-files", ctx.orgId, f));

    const { data: app, error } = await supabase
      .from("opportunity_applications")
      .insert({
        opportunity_id: opp.id,
        applicant_organization_id: ctx.orgId,
        proposal: input.proposal,
        capabilities: input.capabilities,
        attachments,
        submitted_by: ctx.userId,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new UserFacingError("Your company has already applied to this opportunity.");
      dbError(error);
    }
    await logActivity({ organizationId: ctx.orgId, actorId: ctx.userId, action: "application.submitted", entityType: "opportunity_application", entityId: app!.id, summary: `Applied to "${opp.title}"` });
    await notifyOrg(opp.organization_id, {
      type: "application_received",
      title: `New application from ${me?.name}`,
      body: `For "${opp.title}"`,
      link: `/dashboard/opportunities/${opp.id}`,
    }, { permission: "applications.manage" });
    revalidatePath("/dashboard/applications");
    return { ok: true, message: "Application submitted" };
  });
}

export async function withdrawApplicationAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg("applications.manage");
    const admin = createAdminClient();
    const { data: app } = await admin
      .from("opportunity_applications")
      .select("id, status, applicant_organization_id, opportunity:partnership_opportunities(id, title, organization_id)")
      .eq("id", id)
      .single();
    if (!app || app.applicant_organization_id !== ctx.orgId) throw new UserFacingError("Application not found");
    if (["accepted", "rejected", "withdrawn"].includes(app.status)) throw new UserFacingError("This application can no longer be withdrawn.");
    await admin.from("opportunity_applications").update({ status: "withdrawn", status_changed_at: new Date().toISOString() }).eq("id", id);
    const opp = app.opportunity as unknown as { id: string; title: string; organization_id: string };
    await notifyOrg(opp.organization_id, { type: "application_status", title: "An applicant withdrew their application", body: opp.title, link: `/dashboard/opportunities/${opp.id}` }, { permission: "applications.manage" });
    revalidatePath("/dashboard/applications");
    return { ok: true, message: "Application withdrawn" };
  });
}

// ─── Applications (owner review) ───────────────────────────────────────
const REVIEW_ALLOWED: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ["under_review", "shortlisted", "discussion", "rejected"],
  under_review: ["shortlisted", "discussion", "rejected"],
  shortlisted: ["discussion", "under_review", "rejected"],
  discussion: ["shortlisted", "rejected"],
  accepted: [],
  rejected: ["under_review"],
  withdrawn: [],
};

export async function reviewApplicationAction(id: string, status: ApplicationStatus | "accepted", notes?: string): Promise<ActionResult<{ partnershipId?: string }>> {
  return runAction<{ partnershipId?: string }>(async () => {
    const ctx = await requireOrg("applications.manage");
    const supabase = await createClient();
    const admin = createAdminClient();
    const { data: app } = await admin
      .from("opportunity_applications")
      .select("id, status, applicant_organization_id, opportunity:partnership_opportunities(id, title, organization_id)")
      .eq("id", id)
      .single();
    const opp = app?.opportunity as unknown as { id: string; title: string; organization_id: string } | undefined;
    if (!app || !opp || opp.organization_id !== ctx.orgId) throw new UserFacingError("Application not found");

    if (status === "accepted") {
      await assertWithinLimit(ctx.orgId, "active_workspaces");
      const { data: pid, error } = await supabase.rpc("accept_opportunity_application", { p_application: id });
      if (error) dbError(error, "Could not accept application");
      await notifyOrg(app.applicant_organization_id, {
        type: "application_status",
        title: "🎉 Your application was accepted",
        body: `"${opp.title}" — a partnership workspace has been created.`,
        link: `/dashboard/partnerships/${pid}`,
      }, { permission: "applications.manage" });
      revalidatePath(`/dashboard/opportunities/${opp.id}`);
      return { ok: true, data: { partnershipId: pid as string }, message: "Application accepted — partnership workspace created" };
    }

    if (!REVIEW_ALLOWED[app.status as ApplicationStatus].includes(status)) throw new UserFacingError(`Cannot move an application from ${app.status} to ${status}.`);
    const { error } = await admin
      .from("opportunity_applications")
      .update({ status, reviewed_by: ctx.userId, status_changed_at: new Date().toISOString(), ...(notes !== undefined ? { owner_notes: notes } : {}) })
      .eq("id", id);
    if (error) dbError(error);
    await notifyOrg(app.applicant_organization_id, {
      type: "application_status",
      title: `Application ${status.replace("_", " ")}`,
      body: `"${opp.title}"`,
      link: "/dashboard/applications",
    }, { permission: "applications.manage" });
    await logActivity({ organizationId: ctx.orgId, actorId: ctx.userId, action: `application.${status}`, entityType: "opportunity_application", entityId: id, summary: `Application marked ${status.replace("_", " ")}` });
    revalidatePath(`/dashboard/opportunities/${opp.id}`);
    return { ok: true, message: `Application marked ${status.replace("_", " ")}` };
  });
}

export async function applicationAttachmentUrlAction(applicationId: string, path: string): Promise<ActionResult<{ url: string }>> {
  return runAction<{ url: string }>(async () => {
    await requireOrg();
    const supabase = await createClient();
    // RLS: only the applicant company and the opportunity owner (applications.manage) can read the application.
    const { data: app } = await supabase.from("opportunity_applications").select("attachments").eq("id", applicationId).maybeSingle();
    const file = ((app?.attachments ?? []) as { path: string; name: string }[]).find((a) => a.path === path);
    if (!file) throw new UserFacingError("File not found");
    const { signedUrl } = await import("@/lib/storage");
    return { ok: true, data: { url: await signedUrl("application-files", file.path, 120, file.name) } };
  });
}

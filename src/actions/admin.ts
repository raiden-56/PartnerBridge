"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addMonths, addYears } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAction, dbError, UserFacingError, type ActionResult } from "@/lib/actions";
import { requireStaff } from "@/lib/auth/session";
import { audit } from "@/lib/activity";
import { notifyOrg, notifyUsers } from "@/lib/notifications/notify";
import { sendTemplatedEmail } from "@/lib/notifications/email";
import { signedUrl } from "@/lib/storage";
import { slugify, absoluteUrl } from "@/lib/utils";
import { LIMIT_KEYS } from "@/lib/billing/limits";

const uuid = z.string().uuid();

// ─── Verification ──────────────────────────────────────────────────────
export async function reviewVerificationAction(verificationId: string, decision: "verified" | "rejected" | "info_required", notes: string): Promise<ActionResult> {
  return runAction(async () => {
    const staff = await requireStaff();
    uuid.parse(verificationId);
    if (decision !== "verified" && notes.trim().length < 5) throw new UserFacingError("Please explain the decision to the company.");
    const admin = createAdminClient();
    const { data: v } = await admin.from("organization_verifications").select("id, organization_id, status, organization:organizations(name)").eq("id", verificationId).single();
    if (!v) throw new UserFacingError("Verification not found");
    await admin.from("organization_verifications").update({ status: decision, reviewer_id: staff.id, reviewer_notes: notes.trim() || null, reviewed_at: new Date().toISOString() }).eq("id", verificationId);
    await admin.from("organizations").update({ verification_status: decision, verified_at: decision === "verified" ? new Date().toISOString() : null }).eq("id", v.organization_id);
    await audit(staff.id, `verification.${decision}`, "organization", v.organization_id, { verification_id: verificationId, notes });
    const name = (v.organization as unknown as { name: string }).name;
    await notifyOrg(v.organization_id, {
      type: "verification",
      title: decision === "verified" ? `🎉 ${name} is now verified` : decision === "rejected" ? "Verification was not approved" : "More information needed for verification",
      body: notes.trim() || undefined,
      link: "/dashboard/company/verification",
    }, { permission: "verification.manage" });
    revalidatePath("/admin/verification");
    return { ok: true, message: `Marked ${decision.replace("_", " ")}` };
  });
}

export async function revokeVerificationAction(orgId: string, notes: string): Promise<ActionResult> {
  return runAction(async () => {
    const staff = await requireStaff();
    const admin = createAdminClient();
    await admin.from("organizations").update({ verification_status: "rejected", verified_at: null }).eq("id", uuid.parse(orgId));
    await audit(staff.id, "verification.revoked", "organization", orgId, { notes });
    await notifyOrg(orgId, { type: "verification", title: "Verification badge revoked", body: notes, link: "/dashboard/company/verification" }, { permission: "verification.manage" });
    revalidatePath("/admin/companies");
    return { ok: true, message: "Verification revoked" };
  });
}

export async function verificationDocUrlAction(verificationId: string, path: string): Promise<ActionResult<{ url: string }>> {
  return runAction<{ url: string }>(async () => {
    const staff = await requireStaff();
    const admin = createAdminClient();
    const { data } = await admin.from("organization_verifications").select("documents, organization_id").eq("id", verificationId).single();
    const doc = ((data?.documents ?? []) as { path: string; name: string }[]).find((d) => d.path === path);
    if (!doc) throw new UserFacingError("Document not found");
    await audit(staff.id, "verification.document_viewed", "organization", data!.organization_id, { path });
    return { ok: true, data: { url: await signedUrl("verification-docs", doc.path, 120, doc.name) } };
  });
}

// ─── Companies & users ─────────────────────────────────────────────────
export async function setCompanyStatusAction(orgId: string, op: "suspend" | "unsuspend" | "feature" | "unfeature", reason = ""): Promise<ActionResult> {
  return runAction(async () => {
    const staff = await requireStaff();
    const admin = createAdminClient();
    const patch =
      op === "suspend" ? { profile_status: "suspended" } : op === "unsuspend" ? { profile_status: "draft" } : { is_featured: op === "feature" };
    const { error } = await admin.from("organizations").update(patch).eq("id", uuid.parse(orgId));
    if (error) dbError(error);
    if (op === "suspend") await admin.from("partnership_opportunities").update({ status: "paused" }).eq("organization_id", orgId).eq("status", "published");
    await audit(staff.id, `organization.${op}`, "organization", orgId, { reason });
    if (op === "suspend" || op === "unsuspend") {
      await notifyOrg(orgId, { type: "announcement", title: op === "suspend" ? "Your company profile has been suspended" : "Your company profile was reinstated (unpublished)", body: reason || undefined, link: "/dashboard/company" });
    }
    revalidatePath("/admin/companies");
    return { ok: true, message: `Company ${op}d` };
  });
}

export async function setUserStatusAction(userId: string, op: "suspend" | "unsuspend" | "role", role?: string): Promise<ActionResult> {
  return runAction(async () => {
    const staff = await requireStaff(op === "role");
    if (userId === staff.id) throw new UserFacingError("You can't change your own account here.");
    const admin = createAdminClient();
    const { data: target } = await admin.from("profiles").select("platform_role").eq("id", uuid.parse(userId)).single();
    if (target?.platform_role === "super_admin" && staff.platform_role !== "super_admin") throw new UserFacingError("Moderators can't modify super admins.");
    const patch = op === "role" ? { platform_role: z.enum(["user", "moderator", "super_admin"]).parse(role) } : { is_suspended: op === "suspend" };
    const { error } = await admin.from("profiles").update(patch).eq("id", userId);
    if (error) dbError(error);
    await audit(staff.id, `user.${op}`, "user", userId, patch);
    revalidatePath("/admin/users");
    return { ok: true, message: "User updated" };
  });
}

// ─── Opportunities & requests moderation ───────────────────────────────
export async function moderateOpportunityAction(id: string, op: "remove" | "restore", reason = ""): Promise<ActionResult> {
  return runAction(async () => {
    const staff = await requireStaff();
    const admin = createAdminClient();
    const { data: opp } = await admin.from("partnership_opportunities").select("organization_id, title").eq("id", uuid.parse(id)).single();
    if (!opp) throw new UserFacingError("Opportunity not found");
    await admin.from("partnership_opportunities").update({ status: op === "remove" ? "removed" : "draft" }).eq("id", id);
    await audit(staff.id, `opportunity.${op}`, "opportunity", id, { reason });
    await notifyOrg(opp.organization_id, { type: "announcement", title: op === "remove" ? `Opportunity removed by moderators: ${opp.title}` : `Opportunity restored as draft: ${opp.title}`, body: reason || undefined, link: "/dashboard/opportunities" }, { permission: "opportunities.manage" });
    revalidatePath("/admin/opportunities");
    return { ok: true, message: op === "remove" ? "Opportunity removed" : "Opportunity restored as draft" };
  });
}

export async function cancelRequestAsModeratorAction(id: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const staff = await requireStaff();
    const admin = createAdminClient();
    await admin.from("partnership_requests").update({ status: "cancelled", response_message: `Cancelled by moderation: ${reason}` }).eq("id", uuid.parse(id)).in("status", ["sent", "viewed", "negotiation"]);
    await audit(staff.id, "request.moderated", "partnership_request", id, { reason });
    revalidatePath("/admin/requests");
    return { ok: true, message: "Request cancelled" };
  });
}

// ─── Reports ───────────────────────────────────────────────────────────
export async function resolveReportAction(id: string, status: "reviewing" | "resolved" | "dismissed", notes: string): Promise<ActionResult> {
  return runAction(async () => {
    const staff = await requireStaff();
    const admin = createAdminClient();
    const { data: r } = await admin.from("reports").select("reporter_id").eq("id", uuid.parse(id)).single();
    await admin.from("reports").update({ status, resolution_notes: notes || null, resolved_by: staff.id, resolved_at: status === "reviewing" ? null : new Date().toISOString() }).eq("id", id);
    await audit(staff.id, `report.${status}`, "report", id, { notes });
    if (r?.reporter_id && status !== "reviewing") await notifyUsers([r.reporter_id], { type: "announcement", title: `Your report was ${status}`, body: notes || "Thank you for helping keep PartnerBridge safe." });
    revalidatePath("/admin/reports");
    return { ok: true, message: `Report ${status}` };
  });
}

// ─── Billing administration (super admin) ──────────────────────────────
export async function assignPlanAction(orgId: string, planCode: string, months: number): Promise<ActionResult> {
  return runAction(async () => {
    const staff = await requireStaff(true);
    const admin = createAdminClient();
    const { data: plan } = await admin.from("subscription_plans").select("id, name").eq("code", planCode).single();
    if (!plan) throw new UserFacingError("Plan not found");
    await admin.from("subscriptions").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("organization_id", uuid.parse(orgId)).in("status", ["trialing", "active", "past_due"]);
    const now = new Date();
    const end = months >= 12 && months % 12 === 0 ? addYears(now, months / 12) : addMonths(now, Math.max(1, months));
    const { error } = await admin.from("subscriptions").insert({ organization_id: orgId, plan_id: plan.id, status: "active", billing_cycle: months >= 12 ? "yearly" : "monthly", current_period_start: now.toISOString(), current_period_end: planCode === "free" ? null : end.toISOString(), provider: "manual" });
    if (error) dbError(error);
    await audit(staff.id, "subscription.assigned", "organization", orgId, { plan: planCode, months });
    await notifyOrg(orgId, { type: "billing", title: `Your plan was changed to ${plan.name}`, link: "/dashboard/billing" }, { permission: "billing.manage" });
    revalidatePath("/admin/subscriptions");
    return { ok: true, message: `Assigned ${plan.name}` };
  });
}

const planSchema = z.object({
  name: z.string().trim().min(2).max(60),
  tagline: z.string().trim().max(200).optional(),
  price_monthly: z.coerce.number().min(0),
  price_yearly: z.coerce.number().min(0),
  trial_days: z.coerce.number().int().min(0).max(90),
  is_active: z.boolean(),
  features: z.array(z.string().trim().min(1)).max(20),
  limits: z.record(z.string(), z.coerce.number().int().min(-1)),
});

export async function updatePlanAction(id: string, raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const staff = await requireStaff(true);
    const input = planSchema.parse(raw);
    for (const k of Object.keys(input.limits)) if (!(k in LIMIT_KEYS)) throw new UserFacingError(`Unknown limit: ${k}`);
    const admin = createAdminClient();
    const { error } = await admin.from("subscription_plans").update(input).eq("id", uuid.parse(id));
    if (error) dbError(error);
    await audit(staff.id, "plan.updated", "subscription_plan", id, input);
    revalidatePath("/admin/plans");
    return { ok: true, message: "Plan updated" };
  });
}

// ─── Taxonomy ──────────────────────────────────────────────────────────
export async function upsertTaxonomyAction(kind: "industry" | "category", raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const staff = await requireStaff(true);
    const input = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(2).max(80), parentId: z.string().uuid().optional().or(z.literal("")), description: z.string().max(300).optional(), isActive: z.boolean().default(true) }).parse(raw);
    const admin = createAdminClient();
    const table = kind === "industry" ? "industries" : "partnership_categories";
    const row: Record<string, unknown> = { name: input.name, is_active: input.isActive };
    if (kind === "industry") row.parent_id = input.parentId || null;
    else row.description = input.description ?? null;
    const { error } = input.id ? await admin.from(table).update(row).eq("id", input.id) : await admin.from(table).insert({ ...row, slug: slugify(input.name) });
    if (error) dbError(error);
    await audit(staff.id, `${kind}.${input.id ? "updated" : "created"}`, kind, input.id ?? null, row);
    revalidatePath("/admin/taxonomy");
    return { ok: true, message: "Saved" };
  });
}

// ─── Settings, templates, announcements ────────────────────────────────
export async function updateSettingAction(key: string, value: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const staff = await requireStaff(true);
    const allowed: Record<string, z.ZodTypeAny> = {
      matching_weights: z.record(z.string(), z.coerce.number().min(0).max(100)),
      request_expiry_days: z.coerce.number().int().min(1).max(365),
      rate_limits: z.record(z.string(), z.coerce.number().int().min(1).max(10000)),
      maintenance_mode: z.boolean(),
      allow_new_registrations: z.boolean(),
    };
    if (!allowed[key]) throw new UserFacingError("Unknown setting");
    const parsed = allowed[key]!.parse(value);
    const admin = createAdminClient();
    const { error } = await admin.from("platform_settings").update({ value: parsed, updated_by: staff.id, updated_at: new Date().toISOString() }).eq("key", key);
    if (error) dbError(error);
    await audit(staff.id, "settings.updated", "platform_setting", key, { value: parsed });
    revalidatePath("/admin/settings");
    return { ok: true, message: "Setting saved" };
  });
}

export async function updateEmailTemplateAction(key: string, subject: string, body: string): Promise<ActionResult> {
  return runAction(async () => {
    const staff = await requireStaff(true);
    const s = z.string().trim().min(3).max(200).parse(subject);
    const b = z.string().trim().min(10).max(10000).parse(body);
    const admin = createAdminClient();
    const { error } = await admin.from("email_templates").update({ subject: s, body: b, updated_by: staff.id, updated_at: new Date().toISOString() }).eq("key", key);
    if (error) dbError(error);
    await audit(staff.id, "email_template.updated", "email_template", key);
    revalidatePath("/admin/email-templates");
    return { ok: true, message: "Template saved" };
  });
}

export async function sendTestEmailAction(key: string): Promise<ActionResult> {
  return runAction(async () => {
    const staff = await requireStaff(true);
    await sendTemplatedEmail(key, staff.email, { name: staff.full_name ?? "Admin", title: "Test email", body: "This is a test of the template.", link: absoluteUrl("/admin"), company: "Example Co", inviter: "PartnerBridge", role: "Member", status: "verified", notes: "", plan: "Growth", date: "today" });
    return { ok: true, message: `Test sent to ${staff.email} (or logged if email is not configured)` };
  });
}

export async function saveAnnouncementAction(raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const staff = await requireStaff(true);
    const input = z
      .object({ id: z.string().uuid().optional(), title: z.string().trim().min(3).max(120), body: z.string().trim().min(5).max(500), level: z.enum(["info", "warning", "success"]), audience: z.enum(["all", "public", "members"]), endsAt: z.string().optional(), isActive: z.boolean().default(true) })
      .parse(raw);
    const admin = createAdminClient();
    const row = { title: input.title, body: input.body, level: input.level, audience: input.audience, ends_at: input.endsAt || null, is_active: input.isActive, created_by: staff.id };
    const { error } = input.id ? await admin.from("announcements").update(row).eq("id", input.id) : await admin.from("announcements").insert(row);
    if (error) dbError(error);
    await audit(staff.id, "announcement.saved", "announcement", input.id ?? null, row);
    revalidatePath("/admin/announcements");
    return { ok: true, message: "Announcement saved" };
  });
}

export async function markContactHandledAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const staff = await requireStaff();
    await createAdminClient().from("contact_messages").update({ status: "handled" }).eq("id", uuid.parse(id));
    await audit(staff.id, "contact.handled", "contact_message", id);
    revalidatePath("/admin");
    return { ok: true };
  });
}

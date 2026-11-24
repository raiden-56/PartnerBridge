"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAction, dbError, formToObject, UserFacingError, type ActionResult } from "@/lib/actions";
import { requireOrg, requireUser } from "@/lib/auth/session";
import { contactSchema, reportSchema } from "@/lib/validation/schemas";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { notifyUsers, notifyOrg } from "@/lib/notifications/notify";
import { computeRecommendations } from "@/lib/matching/recommendations";
import { getEntitlement } from "@/lib/billing/entitlements";
import { limitValue } from "@/lib/billing/limits";
import { audit } from "@/lib/activity";

export async function toggleSaveCompanyAction(targetOrgId: string): Promise<ActionResult<{ saved: boolean }>> {
  return runAction<{ saved: boolean }>(async () => {
    const ctx = await requireOrg();
    if (targetOrgId === ctx.orgId) throw new UserFacingError("You can't save your own company.");
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("company_saved")
      .select("saved_organization_id")
      .eq("organization_id", ctx.orgId)
      .eq("saved_organization_id", targetOrgId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase.from("company_saved").delete().eq("organization_id", ctx.orgId).eq("saved_organization_id", targetOrgId);
      if (error) dbError(error);
      revalidatePath("/dashboard/saved");
      return { ok: true, data: { saved: false } };
    }
    const { error } = await supabase.from("company_saved").insert({ organization_id: ctx.orgId, saved_organization_id: targetOrgId, saved_by: ctx.userId });
    if (error) dbError(error);
    revalidatePath("/dashboard/saved");
    return { ok: true, data: { saved: true } };
  });
}

export async function reportAction(raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { user } = await requireUser();
    const input = reportSchema.parse(raw);
    await enforceRateLimit("reports_per_hour", user.id);
    const supabase = await createClient();
    const { data: profile } = await supabase.from("profiles").select("active_organization_id").eq("id", user.id).single();
    const { error } = await supabase.from("reports").insert({
      reporter_id: user.id,
      reporter_organization_id: profile?.active_organization_id ?? null,
      target_type: input.targetType,
      target_id: input.targetId,
      reason: input.reason,
      details: input.details,
    });
    if (error) dbError(error);
    const admin = createAdminClient();
    const { data: staff } = await admin.from("profiles").select("id").in("platform_role", ["super_admin", "moderator"]);
    await notifyUsers((staff ?? []).map((s) => s.id), { type: "announcement", title: `New ${input.targetType} report: ${input.reason}`, link: "/admin/reports" });
    return { ok: true, message: "Thanks — our moderation team will review this report." };
  });
}

export async function blockCompanyAction(targetOrgId: string, block: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg("requests.manage");
    if (targetOrgId === ctx.orgId) throw new UserFacingError("You can't block your own company.");
    const supabase = await createClient();
    if (block) {
      const { error } = await supabase
        .from("organization_blocks")
        .upsert({ organization_id: ctx.orgId, blocked_organization_id: targetOrgId, blocked_by: ctx.userId });
      if (error) dbError(error);
    } else {
      const { error } = await supabase.from("organization_blocks").delete().eq("organization_id", ctx.orgId).eq("blocked_organization_id", targetOrgId);
      if (error) dbError(error);
    }
    revalidatePath("/", "layout");
    return { ok: true, message: block ? "Company blocked — they can no longer send you requests." : "Company unblocked" };
  });
}

/** Opens (or reuses) a direct company-to-company conversation. */
export async function startDirectConversationAction(targetOrgId: string): Promise<ActionResult<{ conversationId: string }>> {
  return runAction(async () => {
    const ctx = await requireOrg("messages.direct");
    if (targetOrgId === ctx.orgId) throw new UserFacingError("You can't message your own company.");
    const admin = createAdminClient();
    const { data: target } = await admin.from("organizations").select("id, name, profile_status, deleted_at").eq("id", targetOrgId).single();
    if (!target || target.profile_status !== "published" || target.deleted_at) throw new UserFacingError("Company not available");
    const { data: blocked } = await admin
      .from("organization_blocks")
      .select("organization_id")
      .eq("organization_id", targetOrgId)
      .eq("blocked_organization_id", ctx.orgId)
      .maybeSingle();
    if (blocked) throw new UserFacingError("This company is not accepting messages from you.");

    const [a, b] = [ctx.orgId, targetOrgId].sort();
    const { data: existing } = await admin
      .from("conversations")
      .select("id")
      .eq("kind", "direct")
      .or(`and(organization_a_id.eq.${a},organization_b_id.eq.${b}),and(organization_a_id.eq.${b},organization_b_id.eq.${a})`)
      .maybeSingle();
    if (existing) return { ok: true, data: { conversationId: existing.id } };

    const { data: conv, error } = await admin
      .from("conversations")
      .insert({ kind: "direct", organization_a_id: ctx.orgId, organization_b_id: targetOrgId, subject: `Conversation with ${target.name}`, created_by: ctx.userId })
      .select("id")
      .single();
    if (error) dbError(error);
    await notifyOrg(targetOrgId, { type: "message", title: `${ctx.membership.organization.name} started a conversation`, link: `/dashboard/messages/${conv!.id}` }, { permission: "messages.direct" });
    return { ok: true, data: { conversationId: conv!.id } };
  });
}

export async function refreshRecommendationsAction(): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const ctx = await requireOrg();
    const ent = await getEntitlement(ctx.orgId);
    const limit = limitValue(ent.limits, "recommendations");
    const results = await computeRecommendations(ctx.orgId, limit < 0 ? 100 : limit);
    revalidatePath("/dashboard/matches");
    return { ok: true, data: { count: results.length }, message: `Found ${results.length} matching companies` };
  });
}

export async function dismissRecommendationAction(targetOrgId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg();
    const supabase = await createClient();
    const { error } = await supabase
      .from("partner_recommendations")
      .update({ dismissed: true })
      .eq("organization_id", ctx.orgId)
      .eq("recommended_organization_id", targetOrgId);
    if (error) dbError(error);
    revalidatePath("/dashboard/matches");
    return { ok: true, message: "Recommendation hidden" };
  });
}

export async function contactFormAction(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = contactSchema.parse(formToObject(fd));
    await enforceRateLimit("contact_per_hour", await clientIp());
    const admin = createAdminClient();
    const { error } = await admin.from("contact_messages").insert({ name: input.name, email: input.email, company: input.company, message: input.message });
    if (error) dbError(error);
    await audit(null, "contact.submitted", "contact_message", null, { email: input.email });
    return { ok: true, message: "Thanks! We'll get back to you within two business days." };
  });
}

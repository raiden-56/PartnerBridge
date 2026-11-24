"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAction, dbError, UserFacingError, type ActionResult } from "@/lib/actions";
import { requireOrg, requireUser } from "@/lib/auth/session";
import { inviteSchema } from "@/lib/validation/schemas";
import { assertWithinLimit } from "@/lib/billing/entitlements";
import { assignableRoles, GRANTABLE_PERMISSIONS, ROLE_LABELS, type OrgRole } from "@/lib/auth/permissions";
import { sendTemplatedEmail } from "@/lib/notifications/email";
import { notifyUsers } from "@/lib/notifications/notify";
import { logActivity, audit } from "@/lib/activity";
import { absoluteUrl } from "@/lib/utils";

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
const cleanPerms = (p: string[]) => p.filter((x) => (GRANTABLE_PERMISSIONS as string[]).includes(x));

export async function inviteMemberAction(raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg("team.manage");
    const input = inviteSchema.parse(raw);
    if (!assignableRoles(ctx.role).includes(input.role)) throw new UserFacingError(`You can't invite someone as ${ROLE_LABELS[input.role]}.`);
    await assertWithinLimit(ctx.orgId, "team_members");
    const admin = createAdminClient();

    const { data: existing } = await admin.from("organization_members").select("id, profile:profiles!organization_members_user_id_fkey!inner(email)").eq("organization_id", ctx.orgId).ilike("profile.email", input.email);
    if (existing?.length) throw new UserFacingError("That person is already a member of your company.");

    const token = crypto.randomBytes(32).toString("base64url");
    const { error } = await admin.from("organization_invitations").insert({
      organization_id: ctx.orgId,
      email: input.email,
      role: input.role,
      permissions: input.role === "member" || input.role === "partnership_manager" ? cleanPerms(input.permissions) : [],
      token_hash: hashToken(token),
      invited_by: ctx.userId,
    });
    if (error) {
      if (error.code === "23505") throw new UserFacingError("A pending invitation already exists for this email.");
      dbError(error);
    }
    await sendTemplatedEmail("invitation", input.email, {
      company: ctx.membership.organization.name,
      inviter: ctx.profile.full_name ?? ctx.profile.email,
      role: ROLE_LABELS[input.role],
      link: absoluteUrl(`/invite/${token}`),
    });
    // If the person already has an account, also notify in-app.
    const { data: invitee } = await admin.from("profiles").select("id").ilike("email", input.email).maybeSingle();
    if (invitee) await notifyUsers([invitee.id], { type: "team", title: `You're invited to join ${ctx.membership.organization.name}`, link: `/invite/${token}` });
    await logActivity({ organizationId: ctx.orgId, actorId: ctx.userId, action: "team.invited", summary: `Invited ${input.email} as ${ROLE_LABELS[input.role]}` });
    revalidatePath("/dashboard/team");
    return { ok: true, message: `Invitation sent to ${input.email}` };
  });
}

export async function revokeInvitationAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg("team.manage");
    const admin = createAdminClient();
    const { data, error } = await admin.from("organization_invitations").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("organization_id", ctx.orgId).is("accepted_at", null).select("email");
    if (error) dbError(error);
    if (!data?.length) throw new UserFacingError("Invitation not found");
    revalidatePath("/dashboard/team");
    return { ok: true, message: "Invitation revoked" };
  });
}

export async function acceptInvitationAction(token: string): Promise<ActionResult<{ orgId: string }>> {
  return runAction<{ orgId: string }>(async () => {
    const { user, profile } = await requireUser();
    const admin = createAdminClient();
    const { data: inv } = await admin.from("organization_invitations").select("*").eq("token_hash", hashToken(token)).maybeSingle();
    if (!inv || inv.revoked_at || inv.accepted_at) throw new UserFacingError("This invitation is no longer valid.");
    if (new Date(inv.expires_at) < new Date()) throw new UserFacingError("This invitation has expired. Ask for a new one.");
    if (inv.email.toLowerCase() !== profile.email.toLowerCase()) throw new UserFacingError(`This invitation was sent to ${inv.email}. Sign in with that email to accept it.`);

    const { error } = await admin.from("organization_members").insert({ organization_id: inv.organization_id, user_id: user.id, role: inv.role, permissions: inv.permissions, invited_by: inv.invited_by });
    if (error && error.code !== "23505") dbError(error);
    await admin.from("organization_invitations").update({ accepted_at: new Date().toISOString(), accepted_by: user.id }).eq("id", inv.id);
    await admin.from("profiles").update({ active_organization_id: inv.organization_id, onboarding_completed: true }).eq("id", user.id);
    await logActivity({ organizationId: inv.organization_id, actorId: user.id, action: "team.joined", summary: `${profile.full_name ?? profile.email} joined the team` });
    if (inv.invited_by) await notifyUsers([inv.invited_by], { type: "team", title: `${profile.full_name ?? profile.email} accepted your invitation`, link: "/dashboard/team" });
    revalidatePath("/", "layout");
    return { ok: true, data: { orgId: inv.organization_id }, message: "Welcome to the team!" };
  });
}

async function loadTarget(orgId: string, memberId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("organization_members").select("id, user_id, role").eq("id", memberId).eq("organization_id", orgId).maybeSingle();
  if (!data) throw new UserFacingError("Member not found");
  return data as { id: string; user_id: string; role: OrgRole };
}

export async function updateMemberAction(memberId: string, raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg("team.manage");
    const input = z.object({ role: z.enum(["admin", "partnership_manager", "member"]), permissions: z.array(z.string()).default([]) }).parse(raw);
    const target = await loadTarget(ctx.orgId, memberId);
    if (target.role === "owner") throw new UserFacingError("The owner's role can only change through ownership transfer.");
    if (target.user_id === ctx.userId) throw new UserFacingError("You can't change your own role.");
    if (ctx.role === "admin" && target.role === "admin") throw new UserFacingError("Only the owner can change an admin's role.");
    if (!assignableRoles(ctx.role).includes(input.role)) throw new UserFacingError(`You can't assign the ${ROLE_LABELS[input.role]} role.`);
    const admin = createAdminClient();
    const { error } = await admin.from("organization_members").update({ role: input.role, permissions: cleanPerms(input.permissions) }).eq("id", memberId);
    if (error) dbError(error);
    await logActivity({ organizationId: ctx.orgId, actorId: ctx.userId, action: "team.role_changed", summary: `Member role changed to ${ROLE_LABELS[input.role]}` });
    await notifyUsers([target.user_id], { type: "team", title: `Your role is now ${ROLE_LABELS[input.role]}`, body: ctx.membership.organization.name, link: "/dashboard" });
    revalidatePath("/dashboard/team");
    return { ok: true, message: "Member updated" };
  });
}

export async function removeMemberAction(memberId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg("team.manage");
    const target = await loadTarget(ctx.orgId, memberId);
    if (target.role === "owner") throw new UserFacingError("The owner can't be removed. Transfer ownership first.");
    if (target.user_id === ctx.userId) throw new UserFacingError("Use “Leave company” to remove yourself.");
    if (ctx.role === "admin" && target.role === "admin") throw new UserFacingError("Only the owner can remove an admin.");
    const admin = createAdminClient();
    await admin.from("partnership_members").delete().eq("organization_id", ctx.orgId).eq("user_id", target.user_id);
    const { error } = await admin.from("organization_members").delete().eq("id", memberId);
    if (error) dbError(error);
    await admin.from("profiles").update({ active_organization_id: null }).eq("id", target.user_id).eq("active_organization_id", ctx.orgId);
    await logActivity({ organizationId: ctx.orgId, actorId: ctx.userId, action: "team.removed", summary: "A team member was removed" });
    revalidatePath("/dashboard/team");
    return { ok: true, message: "Member removed" };
  });
}

export async function leaveCompanyAction(): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg();
    if (ctx.role === "owner") throw new UserFacingError("Owners must transfer ownership before leaving.");
    const admin = createAdminClient();
    await admin.from("partnership_members").delete().eq("organization_id", ctx.orgId).eq("user_id", ctx.userId);
    await admin.from("organization_members").delete().eq("organization_id", ctx.orgId).eq("user_id", ctx.userId);
    await admin.from("profiles").update({ active_organization_id: null }).eq("id", ctx.userId);
    revalidatePath("/", "layout");
    return { ok: true, message: "You left the company" };
  });
}

/** Owner-only, requires typing the company name to confirm. Previous owner becomes admin. */
export async function transferOwnershipAction(memberId: string, confirmName: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg("ownership.transfer");
    if (confirmName.trim() !== ctx.membership.organization.name) throw new UserFacingError("Company name doesn't match. Type it exactly to confirm.");
    const target = await loadTarget(ctx.orgId, memberId);
    if (target.user_id === ctx.userId) throw new UserFacingError("You already own this company.");
    const admin = createAdminClient();
    // Demote first (unique owner index), then promote.
    const { error: e1 } = await admin.from("organization_members").update({ role: "admin" }).eq("organization_id", ctx.orgId).eq("user_id", ctx.userId);
    if (e1) dbError(e1);
    const { error: e2 } = await admin.from("organization_members").update({ role: "owner", permissions: [] }).eq("id", memberId);
    if (e2) {
      await admin.from("organization_members").update({ role: "owner" }).eq("organization_id", ctx.orgId).eq("user_id", ctx.userId);
      dbError(e2);
    }
    await logActivity({ organizationId: ctx.orgId, actorId: ctx.userId, action: "team.ownership_transferred", summary: "Company ownership transferred" });
    await audit(ctx.userId, "organization.ownership_transferred", "organization", ctx.orgId, { to: target.user_id });
    await notifyUsers([target.user_id], { type: "team", title: `You are now the owner of ${ctx.membership.organization.name}`, link: "/dashboard/team" });
    revalidatePath("/", "layout");
    return { ok: true, message: "Ownership transferred. You are now an admin." };
  });
}

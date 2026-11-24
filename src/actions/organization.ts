"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAction, dbError, formToObject, UserFacingError, type ActionResult } from "@/lib/actions";
import { requireOrg, requireUser, getOrgContext } from "@/lib/auth/session";
import {
  companyDescriptionSchema,
  companyInfoSchema,
  goalsSchema,
  personalSchema,
  preferencesSchema,
  privacySchema,
  socialSchema,
  verificationSchema,
} from "@/lib/validation/schemas";
import { slugify } from "@/lib/utils";
import { uploadFile, validateFile, publicUrl } from "@/lib/storage";
import { logActivity } from "@/lib/activity";
import { notifyUsers } from "@/lib/notifications/notify";

async function uniqueSlug(name: string) {
  const admin = createAdminClient();
  const base = slugify(name) || "company";
  for (let i = 0; i < 5; i++) {
    const slug = i === 0 ? base : `${base}-${crypto.randomBytes(2).toString("hex")}`;
    const { data } = await admin.from("organizations").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

async function maybeUploadImage(fd: FormData, field: string, folder: string) {
  const file = fd.get(field);
  if (!(file instanceof File) || file.size === 0) return undefined;
  validateFile(file, "image");
  const supabase = await createClient();
  const ref = await uploadFile(supabase, "public-assets", folder, file);
  return publicUrl(ref.path);
}

// ─── Step 1: personal information ──────────────────────────────────────
export async function savePersonalAction(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { user } = await requireUser();
    const input = personalSchema.parse(formToObject(fd));
    const avatar = await maybeUploadImage(fd, "avatar", `users/${user.id}`);
    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: input.fullName, designation: input.designation, phone: input.phone, ...(avatar ? { avatar_url: avatar } : {}) })
      .eq("id", user.id);
    if (error) dbError(error);
    revalidatePath("/", "layout");
    return { ok: true, message: "Profile saved" };
  });
}

// ─── Step 2: company information (creates the company on first save) ───
export async function saveCompanyInfoAction(fd: FormData): Promise<ActionResult<{ organizationId: string }>> {
  return runAction(async () => {
    await requireUser();
    const input = companyInfoSchema.parse(formToObject(fd));
    const supabase = await createClient();
    let orgId = String(fd.get("organizationId") ?? "") || null;

    if (!orgId) {
      const { data, error } = await supabase.rpc("create_organization", { p_name: input.name, p_slug: await uniqueSlug(input.name) });
      if (error) dbError(error, "Could not create company");
      orgId = data as string;
    } else {
      await requireOrg("profile.manage", orgId);
    }

    const logo = await maybeUploadImage(fd, "logo", `orgs/${orgId}`);
    const { error } = await supabase
      .from("organizations")
      .update({
        name: input.name,
        website: input.website,
        year_established: input.yearEstablished ?? null,
        company_size: input.companySize,
        industry_id: input.industryId,
        sub_industry_id: input.subIndustryId,
        registration_country: input.registrationCountry,
        country: input.country,
        state: input.state,
        city: input.city,
        ...(logo ? { logo_url: logo } : {}),
      })
      .eq("id", orgId);
    if (error) dbError(error);

    const { error: cErr } = await supabase
      .from("organization_contacts")
      .update({ email: input.email, phone: input.phone, address: input.address })
      .eq("organization_id", orgId);
    if (cErr) dbError(cErr);

    await bumpStep(orgId!, 3);
    revalidatePath("/", "layout");
    return { ok: true, data: { organizationId: orgId! }, message: "Company details saved" };
  });
}

async function bumpStep(orgId: string, step: number) {
  const admin = createAdminClient();
  const { data } = await admin.from("organizations").select("onboarding_step").eq("id", orgId).single();
  if ((data?.onboarding_step ?? 1) < step) await admin.from("organizations").update({ onboarding_step: step }).eq("id", orgId);
}

// ─── Step 3: description, capabilities, products & services ────────────
export async function saveDescriptionAction(orgId: string, raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await requireOrg("profile.manage", orgId);
    const input = companyDescriptionSchema.parse(raw);
    const supabase = await createClient();
    const { error } = await supabase
      .from("organizations")
      .update({
        short_description: input.shortDescription,
        overview: input.overview,
        mission: input.mission,
        capabilities: input.capabilities,
        target_customers: input.targetCustomers,
        target_markets: input.targetMarkets,
        locations_served: input.locationsServed,
        industries_served: input.industriesServed,
      })
      .eq("id", orgId);
    if (error) dbError(error);

    const { error: delErr } = await supabase.from("company_services").delete().eq("organization_id", orgId);
    if (delErr) dbError(delErr);
    if (input.services.length) {
      const { error: insErr } = await supabase
        .from("company_services")
        .insert(input.services.map((s, i) => ({ organization_id: orgId, kind: s.kind, name: s.name, description: s.description, sort_order: i })));
      if (insErr) dbError(insErr);
    }
    await bumpStep(orgId, 4);
    revalidatePath("/", "layout");
    return { ok: true, message: "Description saved" };
  });
}

// ─── Step 4: partnership preferences ───────────────────────────────────
export async function savePreferencesAction(orgId: string, raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await requireOrg("profile.manage", orgId);
    const input = preferencesSchema.parse(raw);
    const supabase = await createClient();
    const { error: delErr } = await supabase.from("company_partnership_preferences").delete().eq("organization_id", orgId);
    if (delErr) dbError(delErr);
    const rows = [
      ...input.offered.map((c) => ({ organization_id: orgId, category_id: c, direction: "offered" as const })),
      ...input.wanted.map((c) => ({ organization_id: orgId, category_id: c, direction: "wanted" as const })),
    ];
    const { error } = await supabase.from("company_partnership_preferences").insert(rows);
    if (error) dbError(error);
    await supabase.from("organizations").update({ open_to_partnership: input.openToPartnership }).eq("id", orgId);
    await bumpStep(orgId, 5);
    revalidatePath("/", "layout");
    return { ok: true, message: "Partnership preferences saved" };
  });
}

// ─── Step 5: goals ─────────────────────────────────────────────────────
export async function saveGoalsAction(orgId: string, raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await requireOrg("profile.manage", orgId);
    const input = goalsSchema.parse(raw);
    const supabase = await createClient();
    const { error } = await supabase.from("organizations").update({ partnership_goals: input.goals }).eq("id", orgId);
    if (error) dbError(error);
    await bumpStep(orgId, 6);
    revalidatePath("/", "layout");
    return { ok: true, message: "Goals saved" };
  });
}

// ─── Step 6: verification submission ───────────────────────────────────
export async function submitVerificationAction(orgId: string, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg("verification.manage", orgId);
    const input = verificationSchema.parse(formToObject(fd));
    const files = fd.getAll("documents").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) throw new UserFacingError("Upload at least one business registration document.");
    if (files.length > 5) throw new UserFacingError("Upload at most 5 documents.");
    files.forEach((f) => validateFile(f, "verification"));

    const supabase = await createClient();
    const docs = [];
    for (const f of files) docs.push(await uploadFile(supabase, "verification-docs", orgId, f));

    const { error } = await supabase.from("organization_verifications").insert({
      organization_id: orgId,
      status: "pending",
      registration_country: input.registrationCountry,
      registration_type: input.registrationType,
      registration_number: input.registrationNumber,
      tax_id: input.taxId,
      domain: input.domain,
      representative_name: input.representativeName,
      representative_designation: input.representativeDesignation,
      representative_email: input.representativeEmail,
      representative_phone: input.representativePhone,
      documents: docs,
      submitted_by: ctx.userId,
      submitted_at: new Date().toISOString(),
    });
    if (error) dbError(error);

    // Status is a protected column: set it with the service client. Uploading never grants the badge.
    const admin = createAdminClient();
    await admin.from("organizations").update({ verification_status: "pending" }).eq("id", orgId).neq("verification_status", "verified");
    await logActivity({ organizationId: orgId, actorId: ctx.userId, action: "verification.submitted", entityType: "organization", entityId: orgId, summary: "Verification submitted for review" });

    const { data: staff } = await admin.from("profiles").select("id").in("platform_role", ["super_admin", "moderator"]);
    await notifyUsers((staff ?? []).map((s) => s.id), {
      type: "verification",
      title: "New company verification to review",
      link: "/admin/verification",
    });
    await bumpStep(orgId, 7);
    revalidatePath("/", "layout");
    return { ok: true, message: "Verification submitted — our team will review it shortly." };
  });
}

// ─── Publish / finish onboarding ───────────────────────────────────────
export async function publishProfileAction(orgId: string, publish = true): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg("profile.manage", orgId);
    const supabase = await createClient();
    const { data: org } = await supabase
      .from("organizations")
      .select("name, industry_id, short_description, overview, city, country, company_size, profile_status")
      .eq("id", orgId)
      .single();
    if (!org) throw new UserFacingError("Company not found");
    if (org.profile_status === "suspended") throw new UserFacingError("This company is suspended. Contact support.");
    if (publish) {
      const missing = (["industry_id", "short_description", "overview", "city", "country", "company_size"] as const).filter((k) => !org[k]);
      if (missing.length) throw new UserFacingError("Complete company information and description before publishing.");
      const { count } = await supabase.from("company_partnership_preferences").select("*", { count: "exact", head: true }).eq("organization_id", orgId);
      if (!count) throw new UserFacingError("Choose at least one partnership type before publishing.");
    }
    const { error } = await supabase
      .from("organizations")
      .update({ profile_status: publish ? "published" : "draft", ...(publish ? { published_at: new Date().toISOString() } : {}) })
      .eq("id", orgId);
    if (error) dbError(error);
    await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", ctx.userId);
    await logActivity({
      organizationId: orgId,
      actorId: ctx.userId,
      action: publish ? "organization.published" : "organization.unpublished",
      entityType: "organization",
      entityId: orgId,
      summary: publish ? "Company profile published to the marketplace" : "Company profile unpublished",
    });
    revalidatePath("/", "layout");
    return { ok: true, message: publish ? "Your company is now live in the marketplace" : "Profile hidden from the marketplace" };
  });
}

export async function finishOnboardingAction(): Promise<ActionResult> {
  return runAction(async () => {
    const { user } = await requireUser();
    const supabase = await createClient();
    await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", user.id);
    return { ok: true };
  });
}

// ─── Company switching ─────────────────────────────────────────────────
export async function switchOrganizationAction(orgId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { user } = await requireUser();
    const ctx = await getOrgContext();
    if (!ctx?.memberships.some((m) => m.organization_id === orgId)) throw new UserFacingError("You are not a member of that company");
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").update({ active_organization_id: orgId }).eq("id", user.id);
    if (error) dbError(error);
    revalidatePath("/", "layout");
    return { ok: true, message: "Switched company" };
  });
}

// ─── Profile extras: cover image, privacy, social links ────────────────
export async function updateBrandingAction(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg("profile.manage");
    const logo = await maybeUploadImage(fd, "logo", `orgs/${ctx.orgId}`);
    const cover = await maybeUploadImage(fd, "cover", `orgs/${ctx.orgId}`);
    if (!logo && !cover) throw new UserFacingError("Choose an image to upload.");
    const supabase = await createClient();
    const { error } = await supabase
      .from("organizations")
      .update({ ...(logo ? { logo_url: logo } : {}), ...(cover ? { cover_url: cover } : {}) })
      .eq("id", ctx.orgId);
    if (error) dbError(error);
    revalidatePath("/", "layout");
    return { ok: true, message: "Branding updated" };
  });
}

export async function updatePrivacyAction(raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg("profile.manage");
    const privacy = privacySchema.parse(raw);
    const supabase = await createClient();
    const { error } = await supabase.from("organizations").update({ privacy }).eq("id", ctx.orgId);
    if (error) dbError(error);
    revalidatePath("/", "layout");
    return { ok: true, message: "Privacy settings saved" };
  });
}

export async function updateSocialAction(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg("profile.manage");
    const social = socialSchema.parse(formToObject(fd));
    const clean = Object.fromEntries(Object.entries(social).filter(([, v]) => v));
    const supabase = await createClient();
    const { error } = await supabase.from("organizations").update({ social_links: clean }).eq("id", ctx.orgId);
    if (error) dbError(error);
    revalidatePath("/", "layout");
    return { ok: true, message: "Links saved" };
  });
}

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAction, UserFacingError, type ActionResult } from "@/lib/actions";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/activity";

/**
 * Account deletion (DPDP "right to erasure"). Blocks if the user is the sole owner of
 * a company that still has other members; otherwise removes memberships, anonymises the
 * profile and deletes the auth user. Company records owned solely by the user are soft-deleted.
 */
export async function deleteAccountAction(confirm: string): Promise<ActionResult> {
  const res = await runAction(async () => {
    const { user, profile } = await requireUser();
    if (confirm !== "DELETE") throw new UserFacingError('Type DELETE to confirm.');
    const admin = createAdminClient();
    const { data: owned } = await admin.from("organization_members").select("organization_id").eq("user_id", user.id).eq("role", "owner");
    for (const o of owned ?? []) {
      const { count } = await admin.from("organization_members").select("id", { count: "exact", head: true }).eq("organization_id", o.organization_id);
      if ((count ?? 0) > 1) throw new UserFacingError("Transfer ownership of your companies to another member before deleting your account.");
    }
    for (const o of owned ?? []) {
      await admin.from("organizations").update({ deleted_at: new Date().toISOString(), profile_status: "draft" }).eq("id", o.organization_id);
      await admin.from("partnership_opportunities").update({ status: "closed", deleted_at: new Date().toISOString() }).eq("organization_id", o.organization_id);
    }
    await admin.from("data_export_requests").insert({ user_id: user.id, kind: "deletion" });
    await audit(user.id, "account.deleted", "user", user.id, { email_hash: Buffer.from(profile.email).toString("base64").slice(0, 8) });
    await admin.from("partnership_members").delete().eq("user_id", user.id);
    await admin.from("organization_members").delete().eq("user_id", user.id);
    await admin.from("push_subscriptions").delete().eq("user_id", user.id);
    await admin
      .from("profiles")
      .update({ full_name: "Deleted user", email: `deleted-${user.id}@deleted.invalid`, phone: null, avatar_url: null, designation: null, deleted_at: new Date().toISOString(), active_organization_id: null })
      .eq("id", user.id);
    const { error } = await admin.auth.admin.deleteUser(user.id, true);
    if (error) console.error("[account delete]", error);
    const supabase = await createClient();
    await supabase.auth.signOut();
    return { ok: true };
  });
  if (res.ok) redirect("/?accountDeleted=1");
  return res;
}

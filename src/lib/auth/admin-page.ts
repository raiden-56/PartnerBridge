import "server-only";
import { notFound, redirect } from "next/navigation";
import { getProfile, getUser } from "@/lib/auth/session";
import { MODERATOR_MODULES } from "@/lib/auth/permissions";

/** Guards admin pages: staff only; moderators limited to moderation modules. Non-staff get a 404. */
export async function requireAdminPage(module: string) {
  const user = await getUser();
  if (!user) redirect(`/login?next=/admin`);
  const profile = await getProfile();
  if (!profile || profile.is_suspended) notFound();
  if (profile.platform_role === "super_admin") return profile;
  if (profile.platform_role === "moderator" && MODERATOR_MODULES.has(module)) return profile;
  notFound();
}

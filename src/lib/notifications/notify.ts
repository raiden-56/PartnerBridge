import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { absoluteUrl } from "@/lib/utils";
import { roleHasPermission, type OrgRole, type Permission } from "@/lib/auth/permissions";
import { defaultPrefs, type ChannelPrefs, type NotificationType } from "./types";
import { sendTemplatedEmail } from "./email";
import { sendPushToUser } from "./push";

interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  organizationId?: string | null;
  data?: Record<string, unknown>;
}

/** Deliver one notification to a set of users across in-app, email and push according to their preferences. */
export async function notifyUsers(userIds: string[], input: NotifyInput, opts: { excludeUserId?: string } = {}) {
  const ids = Array.from(new Set(userIds)).filter((id) => id && id !== opts.excludeUserId);
  if (ids.length === 0) return;
  const admin = createAdminClient();
  try {
    const [{ data: prefsRows }, { data: profiles }] = await Promise.all([
      admin.from("notification_preferences").select("user_id, preferences").in("user_id", ids),
      admin.from("profiles").select("id, email, full_name, is_suspended, deleted_at").in("id", ids),
    ]);
    const prefsByUser = new Map((prefsRows ?? []).map((r) => [r.user_id as string, r.preferences as Record<string, ChannelPrefs>]));

    const inApp: Record<string, unknown>[] = [];
    const deliveries: Promise<unknown>[] = [];
    for (const p of profiles ?? []) {
      if (p.is_suspended || p.deleted_at) continue;
      const prefs = { ...defaultPrefs(input.type), ...(prefsByUser.get(p.id)?.[input.type] ?? {}) };
      if (prefs.in_app) {
        inApp.push({
          user_id: p.id,
          organization_id: input.organizationId ?? null,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          link: input.link ?? null,
          data: input.data ?? {},
        });
      }
      if (prefs.email && p.email) {
        deliveries.push(
          sendTemplatedEmail("notification", p.email, {
            name: p.full_name ?? "there",
            title: input.title,
            body: input.body ?? "",
            link: absoluteUrl(input.link ?? "/dashboard/notifications"),
          }),
        );
      }
      if (prefs.push) {
        deliveries.push(sendPushToUser(p.id, { title: input.title, body: input.body, link: input.link, tag: input.type }));
      }
    }
    if (inApp.length) await admin.from("notifications").insert(inApp);
    await Promise.allSettled(deliveries);
  } catch (e) {
    console.error("[notify] failed", e);
  }
}

/** Notify every member of an organization who holds a given permission (e.g. requests.manage). */
export async function notifyOrg(orgId: string, input: NotifyInput, opts: { permission?: Permission; excludeUserId?: string } = {}) {
  const admin = createAdminClient();
  const { data: members } = await admin
    .from("organization_members")
    .select("user_id, role, permissions")
    .eq("organization_id", orgId);
  const recipients = (members ?? [])
    .filter((m) => !opts.permission || roleHasPermission(m.role as OrgRole, m.permissions as string[], opts.permission))
    .map((m) => m.user_id as string);
  await notifyUsers(recipients, { ...input, organizationId: input.organizationId ?? orgId }, opts);
}

/** Notify everyone with access to a partnership workspace on a given side (or both sides). */
export async function notifyPartnership(
  partnership: { id: string; organization_a_id: string; organization_b_id: string },
  input: NotifyInput,
  opts: { onlyOrgId?: string; excludeUserId?: string } = {},
) {
  const admin = createAdminClient();
  const orgs = opts.onlyOrgId ? [opts.onlyOrgId] : [partnership.organization_a_id, partnership.organization_b_id];
  const [{ data: members }, { data: explicit }] = await Promise.all([
    admin.from("organization_members").select("user_id, role, permissions, organization_id").in("organization_id", orgs),
    admin.from("partnership_members").select("user_id, organization_id").eq("partnership_id", partnership.id),
  ]);
  const explicitIds = new Set((explicit ?? []).filter((e) => orgs.includes(e.organization_id)).map((e) => e.user_id as string));
  const recipients = (members ?? [])
    .filter((m) => explicitIds.has(m.user_id) || roleHasPermission(m.role as OrgRole, m.permissions as string[], "workspaces.all"))
    .map((m) => m.user_id as string);
  await notifyUsers(recipients, { ...input, data: { ...(input.data ?? {}), partnership_id: partnership.id } }, opts);
}

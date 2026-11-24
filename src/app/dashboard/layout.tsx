import { AppShell } from "@/components/app/app-shell";
import { AnnouncementBar } from "@/components/marketing/announcement-bar";
import { requireOrgPage } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isPlatformStaff } from "@/lib/auth/permissions";
import { LocalDemoBar } from "@/components/demo/local-demo-bar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrgPage();
  const supabase = await createClient();
  const [{ count: unreadNotifications }, { data: unreadRows }, { count: pendingRequests }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).is("read_at", null),
    supabase.rpc("my_unread_counts"),
    ctx.can("requests.manage")
      ? supabase.from("partnership_requests").select("id", { count: "exact", head: true }).eq("receiver_organization_id", ctx.orgId).in("status", ["sent", "viewed"])
      : Promise.resolve({ count: 0 }),
  ]);
  const unreadMessages = ((unreadRows ?? []) as { unread: number }[]).reduce((s, r) => s + Number(r.unread), 0);

  return (
    <AppShell
      user={{ id: ctx.userId, name: ctx.profile.full_name ?? ctx.profile.email, email: ctx.profile.email, avatarUrl: ctx.profile.avatar_url, isStaff: isPlatformStaff(ctx.profile.platform_role) }}
      activeOrgId={ctx.orgId}
      role={ctx.role}
      memberships={ctx.memberships.map((m) => ({ id: m.organization_id, name: m.organization.name, logo: m.organization.logo_url, role: m.role, isDemo: m.organization.is_demo }))}
      counts={{ notifications: unreadNotifications ?? 0, messages: unreadMessages, requests: pendingRequests ?? 0 }}
      banner={
        <>
          <LocalDemoBar />
          <AnnouncementBar audience="members" />
        </>
      }
    >
      {children}
    </AppShell>
  );
}

import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/primitives";
import { PageHeader } from "@/components/shared/common";
import { TeamManager } from "@/components/team/team-manager";
import { requireOrgPage } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getEntitlement, getUsage } from "@/lib/billing/entitlements";
import { limitValue } from "@/lib/billing/limits";
import { assignableRoles, GRANTABLE_PERMISSIONS, PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS, type OrgRole } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const ctx = await requireOrgPage();
  const supabase = await createClient();
  const canManage = ctx.can("team.manage");
  const [{ data: members }, { data: invites }, { data: activity }, ent, used] = await Promise.all([
    supabase.from("organization_members").select("id, user_id, role, permissions, joined_at, profile:profiles!organization_members_user_id_fkey(full_name, email, avatar_url, designation, last_seen_at)").eq("organization_id", ctx.orgId).order("joined_at"),
    canManage
      ? supabase.from("organization_invitations").select("id, email, role, created_at, expires_at").eq("organization_id", ctx.orgId).is("accepted_at", null).is("revoked_at", null).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.from("activity_logs").select("actor_id, created_at").eq("organization_id", ctx.orgId).order("created_at", { ascending: false }).limit(1000),
    getEntitlement(ctx.orgId),
    getUsage(ctx.orgId, "team_members"),
  ]);
  const actionsBy = new Map<string, { count: number; last: string }>();
  for (const a of activity ?? []) {
    if (!a.actor_id) continue;
    const cur = actionsBy.get(a.actor_id);
    actionsBy.set(a.actor_id, { count: (cur?.count ?? 0) + 1, last: cur?.last ?? a.created_at });
  }
  const limit = limitValue(ent.limits, "team_members");

  return (
    <>
      <PageHeader title="Team" description={`Manage who can act on behalf of ${ctx.membership.organization.name}. ${limit < 0 ? "Unlimited seats" : `${used} of ${limit} seats used (including pending invitations)`} on ${ent.planName}.`} />
      <TeamManager
        myUserId={ctx.userId}
        myRole={ctx.role}
        companyName={ctx.membership.organization.name}
        canManage={canManage}
        assignable={assignableRoles(ctx.role)}
        grantable={GRANTABLE_PERMISSIONS.map((p) => ({ key: p, label: PERMISSIONS[p] }))}
        seatsLeft={limit < 0 ? 999 : Math.max(0, limit - used)}
        members={(members ?? []).map((m) => {
          const p = m.profile as unknown as { full_name: string | null; email: string; avatar_url: string | null; designation: string | null };
          const act = actionsBy.get(m.user_id);
          return { id: m.id, userId: m.user_id, role: m.role as OrgRole, permissions: m.permissions as string[], joinedAt: m.joined_at, name: p?.full_name ?? p?.email, email: p?.email, avatar: p?.avatar_url, designation: p?.designation, actions: act?.count ?? 0, lastActive: act?.last ?? null };
        })}
        invites={(invites ?? []) as { id: string; email: string; role: OrgRole; created_at: string; expires_at: string }[]}
      />
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Roles</CardTitle>
          <CardDescription>Permissions are enforced on the server and in the database, not just in the interface.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(ROLE_LABELS) as OrgRole[]).map((r) => (
            <div key={r} className="rounded-lg border border-border p-3">
              <p className="text-sm font-semibold text-slate-900">{ROLE_LABELS[r]}</p>
              <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

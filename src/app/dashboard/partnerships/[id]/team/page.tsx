import { WorkspaceTeam } from "@/components/workspace/workspace-team";
import { getWorkspace } from "@/lib/queries/workspace";
import { createClient } from "@/lib/supabase/server";
import { roleHasPermission, type OrgRole } from "@/lib/auth/permissions";

export default async function WorkspaceTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const supabase = await createClient();
  const { data: explicit } = await supabase.from("partnership_members").select("user_id, organization_id, is_primary_contact").eq("partnership_id", id);
  const { data: myMembers } = await supabase.from("organization_members").select("user_id, role, permissions").eq("organization_id", ws.myOrgId);
  const people = ws.people.map((p) => {
    const e = (explicit ?? []).find((x) => x.user_id === p.id && x.organization_id === p.orgId);
    const mm = (myMembers ?? []).find((m) => m.user_id === p.id);
    const auto = p.orgId === ws.myOrgId && mm ? roleHasPermission(mm.role as OrgRole, mm.permissions as string[], "workspaces.all") : p.role !== "member";
    return { ...p, explicit: !!e, primary: !!e?.is_primary_contact, autoAccess: auto };
  });
  return (
    <WorkspaceTeam
      pid={id}
      myOrgId={ws.myOrgId}
      orgs={[{ id: ws.me.id, name: ws.me.name }, { id: ws.other.id, name: ws.other.name }]}
      people={people}
      canManage={ws.ctx.can("workspaces.all")}
    />
  );
}

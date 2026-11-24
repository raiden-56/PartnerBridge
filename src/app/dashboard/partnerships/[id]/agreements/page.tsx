import { Agreements, type Agreement } from "@/components/workspace/agreements";
import { getWorkspace } from "@/lib/queries/workspace";
import { createClient } from "@/lib/supabase/server";
import { esignStatus } from "@/lib/esign";

export default async function WorkspaceAgreements({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const supabase = await createClient();
  const { data } = await supabase
    .from("partnership_agreements")
    .select("id, title, agreement_type, status, commercial_terms, effective_date, expiration_date, renewal_date, current_version, file_name, approval_a_by, approval_a_at, approval_b_by, approval_b_at, versions:agreement_versions(version, change_note, created_at, file_name)")
    .eq("partnership_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const agreements = ((data ?? []) as unknown as Agreement[]).map((a) => ({ ...a, versions: [...a.versions].sort((x, y) => y.version - x.version) }));
  const p = ws.partnership;
  const nameOf = (oid: string) => (oid === ws.me.id ? ws.me.name : ws.other.name);
  return (
    <Agreements
      pid={id}
      agreements={agreements}
      sideA={nameOf(p.organization_a_id)}
      sideB={nameOf(p.organization_b_id)}
      mySide={ws.myOrgId === p.organization_a_id ? "a" : "b"}
      canManage={ws.ctx.can("workspaces.all")}
      people={Object.fromEntries(ws.people.map((x) => [x.id, x.name]))}
      esign={esignStatus()}
      readOnly={p.status === "ended"}
    />
  );
}

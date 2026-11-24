import { Documents, type Doc } from "@/components/workspace/documents";
import { getWorkspace } from "@/lib/queries/workspace";
import { createClient } from "@/lib/supabase/server";

export default async function WorkspaceDocuments({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const supabase = await createClient();
  // RLS hides the partner's internal documents (and their versions/logs) automatically.
  const { data } = await supabase
    .from("partnership_documents")
    .select("id, title, category, access_level, current_version, file_name, size_bytes, owner_organization_id, uploaded_by, created_at, updated_at, versions:document_versions(version, file_name, size_bytes, change_note, created_at, uploaded_by), logs:document_access_logs(action, user_id, version, created_at)")
    .eq("partnership_id", id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  const docs = ((data ?? []) as unknown as Doc[]).map((d) => ({
    ...d,
    versions: [...d.versions].sort((a, b) => b.version - a.version),
    logs: [...d.logs].sort((a, b) => b.created_at.localeCompare(a.created_at)),
  }));
  return (
    <Documents
      pid={id}
      docs={docs}
      myOrgId={ws.myOrgId}
      orgNames={{ [ws.me.id]: ws.me.name, [ws.other.id]: ws.other.name }}
      people={Object.fromEntries(ws.people.map((p) => [p.id, p.name]))}
      readOnly={ws.partnership.status === "ended"}
    />
  );
}

import { Deals, type Deal } from "@/components/workspace/deals";
import { getWorkspace } from "@/lib/queries/workspace";
import { createClient } from "@/lib/supabase/server";

export default async function WorkspaceDeals({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const supabase = await createClient();
  const { data } = await supabase
    .from("partnership_deals")
    .select("id, title, customer_name, customer_company, customer_email, owner_organization_id, referral_source_organization_id, stage, expected_value, attributed_revenue, verified_revenue, verified_at, expected_close_date, notes, owner_user_id")
    .eq("partnership_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  return (
    <Deals
      pid={id}
      deals={(data ?? []) as Deal[]}
      myOrgId={ws.myOrgId}
      orgs={[{ id: ws.me.id, name: ws.me.name }, { id: ws.other.id, name: ws.other.name }]}
      people={Object.fromEntries(ws.people.map((p) => [p.id, p.name]))}
      canManage={ws.ctx.can("workspaces.all")}
      readOnly={ws.partnership.status === "ended"}
    />
  );
}

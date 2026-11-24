import { Search } from "lucide-react";
import { Badge, Card, Input, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Avatar } from "@/components/ui/overlays";
import { PageHeader } from "@/components/shared/common";
import { AdminAction, RoleSelect } from "@/components/admin/admin-controls";
import { Pagination } from "@/components/shared/pagination";
import { requireAdminPage } from "@/lib/auth/admin-page";
import { createAdminClient } from "@/lib/supabase/admin";
import { setUserStatusAction } from "@/actions/admin";
import { formatDate } from "@/lib/utils";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const me = await requireAdminPage("users");
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const admin = createAdminClient();
  let q = admin.from("profiles").select("id, email, full_name, avatar_url, platform_role, is_suspended, is_demo, created_at, memberships:organization_members!organization_members_user_id_fkey(role, organization:organizations(name))", { count: "exact" }).is("deleted_at", null).order("created_at", { ascending: false });
  if (sp.q) {
    const t = sp.q.replace(/[%,()]/g, "");
    q = q.or(`email.ilike.%${t}%,full_name.ilike.%${t}%`);
  }
  const { data, count } = await q.range((page - 1) * 25, page * 25 - 1);
  return (
    <>
      <PageHeader title="User management" description="Manage platform roles and suspensions. Suspended users can't sign in to the app and lose data access under RLS." />
      <form className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input name="q" defaultValue={sp.q} placeholder="Search name or email" className="pl-9" />
      </form>
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>User</TH>
              <TH className="hidden md:table-cell">Companies</TH>
              <TH>Platform role</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {(data ?? []).map((u) => (
              <TR key={u.id}>
                <TD>
                  <div className="flex items-center gap-2">
                    <Avatar src={u.avatar_url} name={u.full_name ?? u.email} className="size-8 text-[10px]" />
                    <div>
                      <p className="font-medium">{u.full_name ?? "—"} {u.is_demo && <Badge variant="violet">Demo</Badge>}</p>
                      <p className="text-xs text-slate-500">{u.email} · joined {formatDate(u.created_at)}</p>
                    </div>
                  </div>
                </TD>
                <TD className="hidden text-xs md:table-cell">
                  {(u.memberships as unknown as { role: string; organization: { name: string } }[]).map((m) => `${m.organization?.name} (${m.role})`).join(", ") || "—"}
                </TD>
                <TD>{u.id === me.id ? <Badge>You</Badge> : <RoleSelect userId={u.id} role={u.platform_role} />}</TD>
                <TD>{u.is_suspended ? <Badge variant="destructive">Suspended</Badge> : <Badge variant="success">Active</Badge>}</TD>
                <TD>
                  {u.id !== me.id &&
                    (u.is_suspended ? (
                      <AdminAction label="Unsuspend" action={setUserStatusAction.bind(null, u.id, "unsuspend")} />
                    ) : (
                      <AdminAction label="Suspend" variant="destructive" action={setUserStatusAction.bind(null, u.id, "suspend")} prompt="Reason" confirmTitle="Suspend user?" />
                    ))}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Pagination page={page} total={count ?? 0} perPage={25} />
    </>
  );
}

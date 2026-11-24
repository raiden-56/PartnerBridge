import Link from "next/link";
import { Search, Star } from "lucide-react";
import { Card, Input, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { CompanyLogo, DemoBadge, PageHeader, StatusBadge, VerificationBadge } from "@/components/shared/common";
import { AdminAction } from "@/components/admin/admin-controls";
import { Pagination } from "@/components/shared/pagination";
import { requireAdminPage } from "@/lib/auth/admin-page";
import { createAdminClient } from "@/lib/supabase/admin";
import { revokeVerificationAction, setCompanyStatusAction } from "@/actions/admin";
import { formatDate } from "@/lib/utils";

export default async function AdminCompanies({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; status?: string }> }) {
  await requireAdminPage("companies");
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const admin = createAdminClient();
  let q = admin
    .from("organizations")
    .select("id, name, slug, logo_url, profile_status, verification_status, is_featured, is_demo, city, country, created_at, activity_score", { count: "exact" })
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (sp.q) q = q.ilike("name", `%${sp.q.replace(/[%,()]/g, "")}%`);
  if (sp.status) q = q.eq("profile_status", sp.status);
  const { data, count } = await q.range((page - 1) * 25, page * 25 - 1);
  return (
    <>
      <PageHeader title="Company management" description="Suspend, reinstate, feature companies and revoke verification." />
      <form className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input name="q" defaultValue={sp.q} placeholder="Search by name" className="pl-9" />
      </form>
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Company</TH>
              <TH>Profile</TH>
              <TH>Verification</TH>
              <TH className="hidden md:table-cell">Joined</TH>
              <TH>Actions</TH>
            </TR>
          </THead>
          <TBody>
            {(data ?? []).map((o) => (
              <TR key={o.id}>
                <TD>
                  <div className="flex items-center gap-2">
                    <CompanyLogo name={o.name} src={o.logo_url} className="size-8 text-[10px]" />
                    <div>
                      <Link href={`/companies/${o.slug}`} className="font-medium hover:text-accent" target="_blank">
                        {o.name}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {[o.city, o.country].filter(Boolean).join(", ")} {o.is_featured && <Star className="inline size-3 text-amber-500" />}
                      </p>
                    </div>
                    {o.is_demo && <DemoBadge />}
                  </div>
                </TD>
                <TD>
                  <StatusBadge status={o.profile_status} />
                </TD>
                <TD>
                  <VerificationBadge status={o.verification_status} />
                </TD>
                <TD className="hidden text-xs md:table-cell">{formatDate(o.created_at)}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1.5">
                    {o.profile_status === "suspended" ? (
                      <AdminAction label="Reinstate" action={setCompanyStatusAction.bind(null, o.id, "unsuspend")} prompt="Reason" confirmTitle={`Reinstate ${o.name}?`} />
                    ) : (
                      <AdminAction label="Suspend" variant="destructive" action={setCompanyStatusAction.bind(null, o.id, "suspend")} prompt="Reason (shared with the company)" confirmTitle={`Suspend ${o.name}?`} />
                    )}
                    <AdminAction label={o.is_featured ? "Unfeature" : "Feature"} action={setCompanyStatusAction.bind(null, o.id, o.is_featured ? "unfeature" : "feature")} />
                    {o.verification_status === "verified" && <AdminAction label="Revoke badge" action={revokeVerificationAction.bind(null, o.id)} prompt="Reason" confirmTitle="Revoke verification?" />}
                  </div>
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

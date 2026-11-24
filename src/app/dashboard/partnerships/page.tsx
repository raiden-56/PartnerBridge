import type { Metadata } from "next";
import Link from "next/link";
import { Handshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent } from "@/components/ui/primitives";
import { CompanyLogo, DemoBadge, EmptyState, PageHeader, StatusBadge } from "@/components/shared/common";
import { requireOrgPage } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Partnerships" };

export default async function PartnershipsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requireOrgPage();
  const { status } = await searchParams;
  const supabase = await createClient();
  let q = supabase
    .from("partnerships")
    .select("id, title, status, started_at, is_demo, organization_a_id, organization_b_id, category:partnership_categories(name), a:organizations!partnerships_organization_a_id_fkey(id, name, slug, logo_url, industry:industries!organizations_industry_id_fkey(name)), b:organizations!partnerships_organization_b_id_fkey(id, name, slug, logo_url, industry:industries!organizations_industry_id_fkey(name))")
    .or(`organization_a_id.eq.${ctx.orgId},organization_b_id.eq.${ctx.orgId}`)
    .order("started_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data } = await q;

  // Only show workspaces the user can enter (RLS also lets analytics viewers see rows).
  const ids = (data ?? []).map((p) => p.id);
  const access = await Promise.all(ids.map((id) => supabase.rpc("can_access_partnership", { p_partnership: id }).then((r) => [id, !!r.data] as const)));
  const allowed = new Map(access);

  return (
    <>
      <PageHeader title="Partnerships" description="Your company's established partnerships and their shared workspaces." />
      <div className="mb-4 flex gap-1.5">
        {["", "active", "paused", "ended"].map((s) => (
          <Link key={s} href={s ? `/dashboard/partnerships?status=${s}` : "/dashboard/partnerships"} className={`rounded-full border px-3 py-1 text-xs capitalize ${(status ?? "") === s ? "border-accent bg-blue-50 text-accent" : "border-border bg-card text-slate-600"}`}>
            {s || "All"}
          </Link>
        ))}
      </div>
      {(data ?? []).length === 0 ? (
        <EmptyState icon={Handshake} title="No partnerships yet" description="Partnerships are created when a request or an opportunity application is accepted." action={<Button asChild><Link href="/dashboard/matches">Find partners</Link></Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(data ?? []).map((p) => {
            const other = (p.organization_a_id === ctx.orgId ? p.b : p.a) as unknown as { name: string; slug: string; logo_url: string | null; industry: { name: string } | null };
            const can = allowed.get(p.id);
            const inner = (
              <CardContent className="flex items-start gap-4 pt-5">
                <CompanyLogo name={other.name} src={other.logo_url} className="size-12" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{other.name}</p>
                  <p className="text-xs text-slate-500">{other.industry?.name}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <StatusBadge status={p.status} />
                    {p.category && <Badge variant="accent">{(p.category as unknown as { name: string }).name}</Badge>}
                    {p.is_demo && <DemoBadge />}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Since {formatDate(p.started_at)}</p>
                </div>
                {!can && <Badge variant="muted">No workspace access</Badge>}
              </CardContent>
            );
            return can ? (
              <Link key={p.id} href={`/dashboard/partnerships/${p.id}`}>
                <Card className="transition-shadow hover:shadow-[var(--shadow-lift)]">{inner}</Card>
              </Link>
            ) : (
              <Card key={p.id} className="opacity-70">
                {inner}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

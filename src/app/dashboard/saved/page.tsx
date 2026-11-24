import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/shared/common";
import { CompanyCard } from "@/components/company/company-card";
import { requireOrgPage } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getCategories } from "@/lib/queries/reference";
import { ORG_CARD_SELECT, type OrgCard } from "@/lib/queries/marketplace";

export const metadata: Metadata = { title: "Saved companies" };

export default async function SavedPage() {
  const ctx = await requireOrgPage();
  const supabase = await createClient();
  const [{ data: saved }, categories] = await Promise.all([
    supabase.from("company_saved").select("saved_organization_id, created_at").eq("organization_id", ctx.orgId).order("created_at", { ascending: false }),
    getCategories(),
  ]);
  const ids = (saved ?? []).map((s) => s.saved_organization_id as string);
  const { data: orgs } = ids.length ? await supabase.from("organizations").select(ORG_CARD_SELECT).in("id", ids) : { data: [] };
  const byId = new Map(((orgs ?? []) as unknown as OrgCard[]).map((o) => [o.id, o]));
  const items = ids.map((id) => byId.get(id)).filter(Boolean) as OrgCard[];

  return (
    <>
      <PageHeader title="Saved companies" description="Companies your team bookmarked. Saved lists are shared across your company." />
      {items.length === 0 ? (
        <EmptyState icon={Bookmark} title="No saved companies yet" description="Bookmark companies while browsing to build a shortlist." action={<Button asChild><Link href="/dashboard/discover">Discover companies</Link></Button>} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((o) => (
            <CompanyCard key={o.id} org={o} categories={categories} saved signedIn />
          ))}
        </div>
      )}
    </>
  );
}

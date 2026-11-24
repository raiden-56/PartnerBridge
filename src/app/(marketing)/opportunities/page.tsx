import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/common";
import { Pagination } from "@/components/shared/pagination";
import { OpportunityCard } from "@/components/opportunities/opportunity-card";
import { OpportunityFilters } from "@/components/opportunities/opportunity-filters";
import { listOpportunities } from "@/lib/queries/marketplace";
import { getCategories } from "@/lib/queries/reference";

export const metadata: Metadata = { title: "Partnership Opportunities", description: "Browse open partnership opportunities published by companies." };

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const [categories, { items, total }] = await Promise.all([
    getCategories(),
    listOpportunities({ q: sp.q, category: sp.category, location: sp.location, verified: sp.verified === "1", page, perPage: 12 }),
  ]);
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">Opportunity marketplace</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Partnership opportunities</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">Companies publish what they need — distributors, agencies, manufacturers, technology partners and more. Apply with a tailored proposal.</p>
        </div>
        <Button asChild variant="accent">
          <Link href="/dashboard/opportunities/new">
            <Plus /> Post an opportunity
          </Link>
        </Button>
      </div>
      <OpportunityFilters categories={categories} />
      <p className="mt-6 text-sm text-muted-foreground">{total} open opportunit{total === 1 ? "y" : "ies"}</p>
      {items.length === 0 ? (
        <EmptyState className="mt-4" icon={Briefcase} title="No opportunities found" description="Try a different category or location, or post your own opportunity." />
      ) : (
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((o) => (
            <OpportunityCard key={o.id} opp={o} />
          ))}
        </div>
      )}
      <Pagination page={page} total={total} perPage={12} />
    </div>
  );
}

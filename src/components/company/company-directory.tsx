import Link from "next/link";
import { SearchX } from "lucide-react";
import { CompanyCard } from "./company-card";
import { DiscoveryFilters, DiscoveryToolbar } from "./discovery-filters";
import { EmptyState } from "@/components/shared/common";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { searchCompanies, type DiscoveryParams } from "@/lib/queries/marketplace";
import { getCategories, getIndustries } from "@/lib/queries/reference";
import { getOrgContext, getUser } from "@/lib/auth/session";
import { hasFeature } from "@/lib/billing/entitlements";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export type SP = Record<string, string | string[] | undefined>;

const arr = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export async function CompanyDirectory({ searchParams, basePath }: { searchParams: SP; basePath: string }) {
  const [user, ctx, industries, categories] = await Promise.all([getUser(), getOrgContext(), getIndustries(), getCategories()]);
  const advancedAllowed = ctx ? await hasFeature(ctx.orgId, "advanced_filters") : false;

  const params: DiscoveryParams = {
    q: one(searchParams.q),
    industry: arr(searchParams.industry),
    country: one(searchParams.country),
    offered: arr(searchParams.offered),
    verified: one(searchParams.verified) === "1",
    sort: (one(searchParams.sort) as DiscoveryParams["sort"]) ?? "relevance",
    page: Number(one(searchParams.page)) || 1,
    perPage: 12,
    excludeOrgId: ctx?.orgId,
  };
  if (advancedAllowed) {
    Object.assign(params, {
      state: one(searchParams.state),
      city: one(searchParams.city),
      size: arr(searchParams.size),
      foundedFrom: Number(one(searchParams.from)) || undefined,
      foundedTo: Number(one(searchParams.to)) || undefined,
      wanted: arr(searchParams.wanted),
      capabilities: one(searchParams.capability) ? [one(searchParams.capability)!] : undefined,
      markets: one(searchParams.market) ? [one(searchParams.market)!] : undefined,
      open: one(searchParams.open) === "1",
    });
  } else if (arr(searchParams.wanted).length) {
    // Footer/category deep-links use "wanted" — allow this single basic filter for everyone.
    params.wanted = arr(searchParams.wanted);
  }

  const { items, total } = await searchCompanies(params);

  let savedIds = new Set<string>();
  if (ctx && items.length) {
    const supabase = await createClient();
    const { data } = await supabase.from("company_saved").select("saved_organization_id").eq("organization_id", ctx.orgId).in("saved_organization_id", items.map((i) => i.id));
    savedIds = new Set((data ?? []).map((d) => d.saved_organization_id as string));
  }

  const view = one(searchParams.view) === "list" ? "list" : "grid";
  const page = params.page ?? 1;
  const reason = !user ? "Sign in with a Growth plan or above to filter by location, size, founding year and more." : "Available on Growth, Business and Enterprise plans.";

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
      <DiscoveryFilters industries={industries} categories={categories} advancedAllowed={advancedAllowed} advancedReason={reason} />
      <div className="min-w-0 space-y-5">
        <DiscoveryToolbar total={total} />
        <p className="hidden text-sm text-muted-foreground sm:block">
          {total === 0 ? "No companies found" : `Showing ${(page - 1) * 12 + 1}–${Math.min(page * 12, total)} of ${total} companies`}
        </p>
        {items.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No companies match your filters"
            description="Try broadening your search, removing a filter or searching by product or service."
            action={
              <Button asChild variant="outline">
                <Link href={basePath}>Reset filters</Link>
              </Button>
            }
          />
        ) : (
          <div className={cn("grid gap-5", view === "grid" ? "sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-1")}>
            {items.map((o) => (
              <CompanyCard key={o.id} org={o} categories={categories} view={view} saved={savedIds.has(o.id)} signedIn={!!user} />
            ))}
          </div>
        )}
        <Pagination page={page} total={total} perPage={12} />
      </div>
    </div>
  );
}

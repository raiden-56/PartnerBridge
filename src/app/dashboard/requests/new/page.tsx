import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/primitives";
import { CompanyLogo, PageHeader, VerificationBadge } from "@/components/shared/common";
import { RequestForm } from "@/components/requests/request-form";
import { requireOrgPage } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getCategories } from "@/lib/queries/reference";
import { getEntitlement, getUsage } from "@/lib/billing/entitlements";
import { limitValue } from "@/lib/billing/limits";

export const metadata: Metadata = { title: "New partnership request" };

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const ctx = await requireOrgPage("requests.manage");
  const { to } = await searchParams;
  const supabase = await createClient();
  const categories = await getCategories();

  type Target = { id: string; name: string; slug: string; logo_url: string | null; verification_status: "verified"; short_description: string | null; city: string | null; country: string | null; open_to_partnership: boolean };
  let target: Target | null = null;
  let suggested: string[] = [];
  if (to) {
    const { data } = await supabase
      .from("organizations")
      .select("id, name, slug, logo_url, verification_status, short_description, city, country, open_to_partnership")
      .eq("slug", to)
      .eq("profile_status", "published")
      .maybeSingle();
    target = data as Target | null;
    if (target) {
      const { data: prefs } = await supabase.from("company_partnership_preferences").select("category_id").eq("organization_id", target.id);
      suggested = Array.from(new Set((prefs ?? []).map((p) => p.category_id as string)));
    }
  }
  const { data: companies } = target
    ? { data: [] }
    : await supabase.from("organizations").select("id, name").eq("profile_status", "published").eq("open_to_partnership", true).neq("id", ctx.orgId).is("deleted_at", null).order("name").limit(500);

  const [ent, used] = await Promise.all([getEntitlement(ctx.orgId), getUsage(ctx.orgId, "partnership_requests_per_month")]);
  const own = target?.id === ctx.orgId;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/requests" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900">
        <ArrowLeft className="size-4" /> Requests
      </Link>
      <PageHeader title="Send a partnership request" description="A specific, well-structured proposal gets far better responses than a generic introduction." />
      {target && (
        <Card className="mb-5">
          <CardContent className="flex items-center gap-3 pt-5">
            <CompanyLogo name={target.name} src={target.logo_url} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-semibold text-slate-900">
                {target.name} <VerificationBadge status={target.verification_status} compact showUnverified={false} />
              </p>
              <p className="flex items-center gap-1 text-xs text-slate-500">
                <MapPin className="size-3" /> {[target.city, target.country].filter(Boolean).join(", ")}
              </p>
              <p className="mt-1 line-clamp-1 text-sm text-slate-600">{target.short_description}</p>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="pt-6">
          {own ? (
            <p className="text-sm text-muted-foreground">You can&apos;t send a request to your own company.</p>
          ) : target && !target.open_to_partnership ? (
            <p className="text-sm text-muted-foreground">{target.name} isn&apos;t accepting new partnership requests right now. You can save the company and check back later.</p>
          ) : to && !target ? (
            <p className="text-sm text-muted-foreground">That company could not be found.</p>
          ) : (
            <RequestForm
              target={target ? { id: target.id, name: target.name } : null}
              companies={(companies ?? []) as { id: string; name: string }[]}
              categories={categories}
              suggestedCategoryIds={suggested}
              usage={{ used, limit: limitValue(ent.limits, "partnership_requests_per_month") }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { Building2, Globe, MapPin, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { CompanyLogo, DemoBadge, VerificationBadge } from "@/components/shared/common";
import { HoverLift } from "@/components/shared/motion";
import { SaveCompanyButton } from "./save-button";
import { cn, websiteHost } from "@/lib/utils";
import type { OrgCard } from "@/lib/queries/marketplace";
import type { Category } from "@/types/db";

export function CompanyCard({
  org,
  categories,
  view = "grid",
  saved,
  signedIn,
  matchScore,
}: {
  org: OrgCard;
  categories: Category[];
  view?: "grid" | "list";
  saved?: boolean;
  signedIn?: boolean;
  matchScore?: number;
}) {
  const catName = (id: string) => categories.find((c) => c.id === id)?.name;
  const offered = org.prefs.filter((p) => p.direction === "offered").map((p) => catName(p.category_id)).filter(Boolean) as string[];
  const wanted = org.prefs.filter((p) => p.direction === "wanted").map((p) => catName(p.category_id)).filter(Boolean) as string[];
  const location = [org.city, org.country].filter(Boolean).join(", ");
  const requestHref = signedIn ? `/dashboard/requests/new?to=${org.slug}` : `/login?next=${encodeURIComponent(`/dashboard/requests/new?to=${org.slug}`)}`;

  return (
    <HoverLift className="h-full">
      <article
        className={cn(
          "group relative flex h-full rounded-xl border border-border bg-card shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]",
          view === "grid" ? "flex-col p-5" : "flex-col gap-4 p-5 md:flex-row md:items-center",
        )}
      >
        {org.is_featured && <span className="absolute -top-2 left-4 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">Featured</span>}
        <div className={cn("flex gap-3", view === "list" && "md:w-80 md:shrink-0")}>
          <CompanyLogo name={org.name} src={org.logo_url} className="size-12" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Link href={`/companies/${org.slug}`} className="truncate font-semibold text-slate-900 after:absolute after:inset-0 hover:text-accent">
                {org.name}
              </Link>
              {org.verification_status === "verified" && <VerificationBadge status="verified" compact />}
            </div>
            <p className="flex items-center gap-1 truncate text-xs text-slate-500">
              <Building2 className="size-3" />
              {org.industry?.name ?? "Industry not set"}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              {location && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3" />
                  {location}
                </span>
              )}
              {org.company_size && (
                <span className="flex items-center gap-1">
                  <Users className="size-3" />
                  {org.company_size}
                </span>
              )}
            </div>
          </div>
          {typeof matchScore === "number" && (
            <div className="shrink-0 text-right">
              <p className="font-display text-xl font-bold text-accent">{matchScore}%</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">match</p>
            </div>
          )}
        </div>

        <div className={cn("min-w-0", view === "grid" ? "mt-4 flex-1 space-y-3" : "flex-1 space-y-2")}>
          <p className="line-clamp-2 text-sm text-slate-600">{org.short_description ?? "No description yet."}</p>
          {offered.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Offers</span>
              {offered.slice(0, 3).map((c) => (
                <Badge key={c} variant="accent">
                  {c}
                </Badge>
              ))}
              {offered.length > 3 && <Badge variant="outline">+{offered.length - 3}</Badge>}
            </div>
          )}
          {wanted.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Seeks</span>
              {wanted.slice(0, 3).map((c) => (
                <Badge key={c} variant="outline">
                  {c}
                </Badge>
              ))}
              {wanted.length > 3 && <Badge variant="outline">+{wanted.length - 3}</Badge>}
            </div>
          )}
        </div>

        <div className={cn("relative z-10 flex items-center gap-2", view === "grid" ? "mt-5 border-t border-border pt-4" : "md:shrink-0")}>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {org.is_demo && <DemoBadge />}
            {org.website && view === "grid" && (
              <a href={org.website} target="_blank" rel="noopener noreferrer nofollow" className="flex min-w-0 items-center gap-1 truncate text-xs text-slate-500 hover:text-accent">
                <Globe className="size-3 shrink-0" />
                <span className="truncate">{websiteHost(org.website)}</span>
              </a>
            )}
          </div>
          <SaveCompanyButton orgId={org.id} initialSaved={!!saved} signedIn={!!signedIn} />
          {org.open_to_partnership && (
            <Button asChild size="sm" variant="accent">
              <Link href={requestHref}>
                <Send /> Request
              </Link>
            </Button>
          )}
          <Button asChild size="sm" variant="outline" className={view === "grid" ? "hidden sm:inline-flex" : ""}>
            <Link href={`/companies/${org.slug}`}>View</Link>
          </Button>
        </div>
      </article>
    </HoverLift>
  );
}

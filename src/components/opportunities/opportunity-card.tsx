import Link from "next/link";
import { CalendarClock, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { CompanyLogo, DemoBadge, VerificationBadge } from "@/components/shared/common";
import { HoverLift } from "@/components/shared/motion";
import { formatDate, timeAgo } from "@/lib/utils";
import type { Opportunity } from "@/types/db";

export function OpportunityCard({ opp }: { opp: Opportunity }) {
  const closingSoon = opp.deadline && new Date(opp.deadline).getTime() - Date.now() < 7 * 86400_000;
  return (
    <HoverLift className="h-full">
      <article className="relative flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]">
        <div className="flex items-start justify-between gap-2">
          {opp.category && <Badge variant="accent">{opp.category.name}</Badge>}
          <div className="flex items-center gap-1.5">
            {opp.is_demo && <DemoBadge />}
            {opp.status !== "published" && <Badge variant="warning">{opp.status === "paused" ? "Paused" : "Closed"}</Badge>}
          </div>
        </div>
        <h3 className="mt-3 line-clamp-2 font-semibold text-slate-900">
          <Link href={`/opportunities/${opp.id}`} className="after:absolute after:inset-0 hover:text-accent">
            {opp.title}
          </Link>
        </h3>
        <p className="mt-1.5 line-clamp-2 text-sm text-slate-600">{opp.description}</p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
          {opp.target_locations.length > 0 && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" /> {opp.target_locations.slice(0, 2).join(", ")}
              {opp.target_locations.length > 2 && ` +${opp.target_locations.length - 2}`}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="size-3.5" /> {opp.application_count} application{opp.application_count === 1 ? "" : "s"}
          </span>
          {opp.deadline && (
            <span className={`flex items-center gap-1 ${closingSoon ? "font-medium text-amber-600" : ""}`}>
              <CalendarClock className="size-3.5" /> Apply by {formatDate(opp.deadline)}
            </span>
          )}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-4 [margin-top:max(1rem,auto)]">
          {opp.organization && (
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <CompanyLogo name={opp.organization.name} src={opp.organization.logo_url} className="size-7 text-[10px]" />
              <span className="truncate font-medium text-slate-800">{opp.organization.name}</span>
              <VerificationBadge status={opp.organization.verification_status} compact showUnverified={false} />
            </span>
          )}
          <span className="shrink-0 text-xs text-slate-400">{timeAgo(opp.published_at ?? opp.created_at)}</span>
        </div>
      </article>
    </HoverLift>
  );
}

import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { CompanyLogo, DemoBadge, StatusBadge } from "@/components/shared/common";
import { WorkspaceTabs } from "@/components/workspace/workspace-tabs";
import { PartnershipStatusMenu } from "@/components/workspace/status-menu";
import { getWorkspace } from "@/lib/queries/workspace";
import { formatDate } from "@/lib/utils";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const p = ws.partnership;
  return (
    <div className="space-y-6">
      <Link href="/dashboard/partnerships" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900">
        <ArrowLeft className="size-4" /> Partnerships
      </Link>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="relative bg-gradient-to-r from-navy-900 via-blue-900 to-accent px-6 py-6 text-white">
          <div className="absolute inset-0 bg-grid opacity-10" />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex -space-x-3">
                <CompanyLogo name={ws.me.name} src={ws.me.logo_url} className="size-12 border-2 border-white" />
                <CompanyLogo name={ws.other.name} src={ws.other.logo_url} className="size-12 border-2 border-white" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold sm:text-2xl">{p.title}</h1>
                <p className="text-sm text-blue-100">
                  {ws.me.name} <span className="text-blue-300">×</span>{" "}
                  <Link href={`/companies/${ws.other.slug}`} className="underline-offset-2 hover:underline">
                    {ws.other.name}
                  </Link>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={p.status} />
              {ws.categoryName && <Badge className="border-white/20 bg-white/10 text-white">{ws.categoryName}</Badge>}
              {p.is_demo && <DemoBadge />}
              <span className="text-xs text-blue-100">Since {formatDate(p.started_at)}</span>
              {ws.ctx.can("workspaces.all") && <PartnershipStatusMenu pid={p.id} status={p.status} />}
            </div>
          </div>
          <p className="relative mt-3 flex items-center gap-1.5 text-xs text-blue-200">
            <Lock className="size-3" /> Private workspace — visible only to authorized members of both companies.
          </p>
        </div>
        <WorkspaceTabs pid={p.id} />
      </div>
      {children}
    </div>
  );
}

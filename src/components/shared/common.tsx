import * as React from "react";
import Link from "next/link";
import { BadgeCheck, Clock, ShieldAlert, ShieldQuestion, XCircle, FlaskConical, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { Avatar } from "@/components/ui/overlays";
import { cn, titleCase } from "@/lib/utils";
import type { VerificationStatus } from "@/types/db";

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#172554" />
        <path d="M8.5 20.6 Q16 6.9 23.5 20.6" stroke="#60a5fa" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M6 23.3H26" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8.5" cy="20.6" r="2.9" fill="#fff" />
        <circle cx="23.5" cy="20.6" r="2.9" fill="#2563eb" stroke="#fff" strokeWidth="1.4" />
      </svg>
      <span className={cn("font-display text-lg", light ? "text-white" : "text-navy-900")}>
        Partner<span className="text-accent">Bridge</span>
      </span>
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow && <div className="text-xs font-semibold uppercase tracking-wider text-accent">{eyebrow}</div>}
        <h1 className="text-2xl font-bold text-slate-900 sm:text-[1.7rem]">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center", className)}>
      <div className="relative mb-4">
        <div className="absolute inset-0 -m-3 rounded-full bg-blue-100/60 blur-md" />
        <div className="relative flex size-12 items-center justify-center rounded-2xl border border-blue-100 bg-white text-accent shadow-sm">
          <Icon className="size-6" />
        </div>
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const VERIFICATION: Record<VerificationStatus, { label: string; variant: "success" | "warning" | "destructive" | "muted" | "accent"; icon: LucideIcon }> = {
  verified: { label: "Verified", variant: "success", icon: BadgeCheck },
  pending: { label: "Verification pending", variant: "warning", icon: Clock },
  info_required: { label: "Info required", variant: "warning", icon: ShieldAlert },
  rejected: { label: "Verification rejected", variant: "destructive", icon: XCircle },
  not_submitted: { label: "Not verified", variant: "muted", icon: ShieldQuestion },
};

/** Only status === 'verified' (set by platform staff) renders the verified badge. */
export function VerificationBadge({ status, compact, showUnverified = true }: { status: VerificationStatus; compact?: boolean; showUnverified?: boolean }) {
  if (status !== "verified" && !showUnverified) return null;
  const v = VERIFICATION[status] ?? VERIFICATION.not_submitted;
  const Icon = v.icon;
  if (compact && status === "verified") {
    return (
      <span title="Verified by PartnerBridge" className="inline-flex text-accent">
        <BadgeCheck className="size-4" aria-label="Verified company" />
      </span>
    );
  }
  return (
    <Badge variant={v.variant}>
      <Icon />
      {v.label}
    </Badge>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge variant="violet" className={className} title="Fictional demonstration data — not a real company">
      <FlaskConical />
      Demo
    </Badge>
  );
}

const STATUS_VARIANTS: Record<string, "success" | "warning" | "destructive" | "muted" | "accent" | "violet" | "secondary"> = {
  // requests
  draft: "muted",
  sent: "accent",
  viewed: "violet",
  accepted: "success",
  rejected: "destructive",
  negotiation: "warning",
  cancelled: "muted",
  expired: "muted",
  // applications
  submitted: "accent",
  under_review: "violet",
  shortlisted: "warning",
  discussion: "warning",
  withdrawn: "muted",
  // opportunities
  published: "success",
  paused: "warning",
  closed: "muted",
  removed: "destructive",
  // partnerships
  active: "success",
  ended: "muted",
  // tasks
  todo: "muted",
  in_progress: "accent",
  blocked: "destructive",
  done: "success",
  // milestones
  planned: "muted",
  completed: "success",
  missed: "destructive",
  // agreements
  approved: "accent",
  terminated: "destructive",
  // deals
  lead: "muted",
  qualified: "accent",
  proposal: "violet",
  won: "success",
  lost: "destructive",
  // billing
  trialing: "violet",
  past_due: "warning",
  paid: "success",
  failed: "destructive",
  created: "muted",
  pending: "warning",
  // reports
  open: "warning",
  reviewing: "accent",
  resolved: "success",
  dismissed: "muted",
  verified: "success",
  info_required: "warning",
  not_submitted: "muted",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant={STATUS_VARIANTS[status] ?? "secondary"} className={className}>
      {titleCase(status)}
    </Badge>
  );
}

export function CompanyLogo({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  return <Avatar square name={name} src={src} className={cn("size-11 text-base", className)} />;
}

export function CompanyLink({ org, className }: { org: { name: string; slug: string; logo_url?: string | null; verification_status?: VerificationStatus }; className?: string }) {
  return (
    <Link href={`/companies/${org.slug}`} className={cn("inline-flex items-center gap-2 font-medium text-slate-900 hover:text-accent", className)}>
      <CompanyLogo name={org.name} src={org.logo_url} className="size-7 text-xs" />
      <span className="truncate">{org.name}</span>
      {org.verification_status === "verified" && <VerificationBadge status="verified" compact />}
    </Link>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "blue",
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  hint?: React.ReactNode;
  tone?: "blue" | "green" | "amber" | "violet" | "slate";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    violet: "bg-violet-50 text-violet-600",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
        </div>
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", tones[tone])}>
          <Icon className="size-[18px]" />
        </div>
      </div>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

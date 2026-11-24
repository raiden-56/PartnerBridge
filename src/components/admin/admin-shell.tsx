"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Building2,
  CreditCard,
  FileWarning,
  Flag,
  LayoutDashboard,
  Layers,
  Mail,
  Megaphone,
  Menu,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Briefcase,
  Users,
  X,
  Package,
} from "lucide-react";
import { Logo } from "@/components/shared/common";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, mod: "dashboard" },
  { href: "/admin/companies", label: "Companies", icon: Building2, mod: "companies" },
  { href: "/admin/verification", label: "Verification", icon: ShieldCheck, mod: "verification" },
  { href: "/admin/users", label: "Users", icon: Users, mod: "users" },
  { href: "/admin/opportunities", label: "Opportunities", icon: Briefcase, mod: "opportunities" },
  { href: "/admin/requests", label: "Request monitoring", icon: Activity, mod: "requests" },
  { href: "/admin/reports", label: "Reports", icon: Flag, mod: "reports" },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard, mod: "subscriptions" },
  { href: "/admin/payments", label: "Payments", icon: Receipt, mod: "payments" },
  { href: "/admin/plans", label: "Plans & limits", icon: Package, mod: "plans" },
  { href: "/admin/taxonomy", label: "Industries & categories", icon: Layers, mod: "taxonomy" },
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone, mod: "announcements" },
  { href: "/admin/email-templates", label: "Email templates", icon: Mail, mod: "email-templates" },
  { href: "/admin/settings", label: "Platform settings", icon: Settings, mod: "settings" },
  { href: "/admin/audit", label: "Audit logs", icon: ScrollText, mod: "audit" },
];
const MODERATOR = new Set(["dashboard", "companies", "verification", "opportunities", "requests", "reports", "featured"]);

export function AdminShell({ role, name, children }: { role: "moderator" | "super_admin"; name: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => setOpen(false), [pathname]);
  const items = NAV.filter((n) => role === "super_admin" || MODERATOR.has(n.mod));
  const nav = (
    <nav className="space-y-0.5 p-3" aria-label="Admin">
      {items.map((n) => {
        const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium", active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white")}>
            <n.icon className="size-4" /> {n.label}
          </Link>
        );
      })}
      <Link href="/dashboard" className="mt-4 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="size-4" /> Back to app
      </Link>
    </nav>
  );
  return (
    <div className="min-h-dvh bg-slate-50">
      <aside className={cn("fixed inset-y-0 left-0 z-40 w-64 overflow-y-auto bg-navy-950 transition-transform lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-16 items-center justify-between px-5">
          <Logo light />
          <button className="text-slate-400 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>
        <p className="mx-5 mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
          <FileWarning className="size-3" /> {role === "super_admin" ? "Super admin" : "Moderator"}
        </p>
        {nav}
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <p className="text-sm font-semibold text-slate-900">Platform administration</p>
          <span className="ml-auto text-xs text-slate-500">{name} · all actions are audit-logged</span>
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}

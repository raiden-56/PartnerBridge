"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Bookmark,
  Briefcase,
  Building2,
  ChevronsUpDown,
  Compass,
  CreditCard,
  FileStack,
  Handshake,
  Home,
  Inbox,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Settings,
  Shield,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Avatar, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlays";
import { Logo } from "@/components/shared/common";
import { NotificationBell } from "./notification-bell";
import { switchOrganizationAction } from "@/actions/organization";
import { signOutAction } from "@/actions/auth";
import { clearUserCaches } from "@/components/pwa/pwa-provider";
import { ROLE_LABELS, type OrgRole } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  exact?: boolean;
}

export function AppShell({
  user,
  activeOrgId,
  role,
  memberships,
  counts,
  banner,
  children,
}: {
  user: { id: string; name: string; email: string; avatarUrl: string | null; isStaff: boolean };
  activeOrgId: string;
  role: OrgRole;
  memberships: { id: string; name: string; logo: string | null; role: OrgRole; isDemo: boolean }[];
  counts: { notifications: number; messages: number; requests: number };
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  React.useEffect(() => setMobileOpen(false), [pathname]);

  const primary: NavItem[] = [
    { href: "/dashboard", label: "Overview", icon: Home, exact: true },
    { href: "/dashboard/discover", label: "Discover", icon: Compass },
    { href: "/dashboard/matches", label: "Smart matches", icon: Sparkles },
    { href: "/dashboard/requests", label: "Requests", icon: Inbox, badge: counts.requests },
    { href: "/dashboard/partnerships", label: "Partnerships", icon: Handshake },
    { href: "/dashboard/messages", label: "Messages", icon: MessageSquare, badge: counts.messages },
    { href: "/dashboard/opportunities", label: "My opportunities", icon: Briefcase },
    { href: "/dashboard/applications", label: "My applications", icon: FileStack },
    { href: "/dashboard/saved", label: "Saved companies", icon: Bookmark },
    { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  ];
  const company: NavItem[] = [
    { href: "/dashboard/company", label: "Company profile", icon: Building2 },
    { href: "/dashboard/team", label: "Team", icon: Users },
    { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ];
  const isActive = (i: NavItem) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + "/"));
  const active = memberships.find((m) => m.id === activeOrgId);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Link href="/dashboard" aria-label="Dashboard home">
          <Logo />
        </Link>
      </div>
      <div className="px-3">
        <OrgSwitcher memberships={memberships} activeOrgId={activeOrgId} />
      </div>
      <nav className="mt-4 flex-1 space-y-6 overflow-y-auto px-3 pb-4 scrollbar-thin" aria-label="Dashboard">
        <NavGroup items={primary} isActive={isActive} />
        <div>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Company</p>
          <NavGroup items={company} isActive={isActive} />
        </div>
        {user.isStaff && (
          <div>
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Platform</p>
            <NavGroup items={[{ href: "/admin", label: "Admin console", icon: Shield }]} isActive={() => false} />
          </div>
        )}
      </nav>
      <div className="border-t border-border p-3 text-xs text-slate-500">
        {active && (
          <p className="px-2">
            Signed in as <span className="font-medium text-slate-700">{ROLE_LABELS[role]}</span>
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-background">
      {banner && <div className="lg:pl-64">{banner}</div>}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-white lg:block">{sidebar}</aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-2xl lg:hidden"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", stiffness: 400, damping: 40 }}
            >
              <button className="absolute right-3 top-4 rounded-md p-1.5 hover:bg-secondary" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X className="size-5" />
              </button>
              {sidebar}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-white/85 px-4 backdrop-blur-md sm:px-6">
          <button className="-ml-1 rounded-md p-2 hover:bg-secondary lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <div className="lg:hidden">
            <Logo className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
          </div>
          <div className="flex-1" />
          <Link href="/dashboard/requests/new" className="hidden items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent/90 sm:inline-flex">
            <Plus className="size-4" /> New request
          </Link>
          <NotificationBell userId={user.id} initialCount={counts.notifications} />
          <UserMenu user={user} />
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 pb-28 sm:px-6 lg:py-8 lg:pb-10">
          <motion.div key={pathname.split("/").slice(0, 4).join("/")} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            {children}
          </motion.div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 backdrop-blur lg:hidden" aria-label="Quick navigation">
        <div className="grid grid-cols-5">
          {[
            { href: "/dashboard", label: "Home", icon: Home, exact: true },
            { href: "/dashboard/discover", label: "Discover", icon: Compass },
            { href: "/dashboard/requests", label: "Requests", icon: Inbox, badge: counts.requests },
            { href: "/dashboard/partnerships", label: "Partners", icon: Handshake },
            { href: "/dashboard/messages", label: "Messages", icon: MessageSquare, badge: counts.messages },
          ].map((i) => {
            const on = isActive(i);
            return (
              <Link key={i.href} href={i.href} className={cn("relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium", on ? "text-accent" : "text-slate-500")} aria-current={on ? "page" : undefined}>
                <i.icon className="size-5" />
                {i.label}
                {!!i.badge && <span className="absolute right-[22%] top-1.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] leading-4 text-white">{i.badge > 99 ? "99+" : i.badge}</span>}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function NavGroup({ items, isActive }: { items: NavItem[]; isActive: (i: NavItem) => boolean }) {
  return (
    <ul className="space-y-0.5">
      {items.map((i) => {
        const on = isActive(i);
        return (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                on ? "text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              {on && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg bg-blue-50 ring-1 ring-blue-100" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              <i.icon className={cn("relative size-[18px]", on ? "text-accent" : "text-slate-400")} />
              <span className="relative flex-1">{i.label}</span>
              {!!i.badge && <span className="relative rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">{i.badge > 99 ? "99+" : i.badge}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function OrgSwitcher({ memberships, activeOrgId }: { memberships: { id: string; name: string; logo: string | null; role: OrgRole; isDemo: boolean }[]; activeOrgId: string }) {
  const router = useRouter();
  const active = memberships.find((m) => m.id === activeOrgId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-slate-50/60 p-2 text-left hover:bg-slate-100">
        <Avatar square src={active?.logo} name={active?.name} className="size-8 text-xs" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900">{active?.name}</span>
          <span className="block text-[11px] text-slate-500">{active ? ROLE_LABELS[active.role] : ""}</span>
        </span>
        <ChevronsUpDown className="size-4 text-slate-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Your companies</DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onSelect={async () => {
              if (m.id === activeOrgId) return;
              const res = await switchOrganizationAction(m.id);
              if (res.ok) {
                toast.success(`Switched to ${m.name}`);
                router.refresh();
              } else toast.error(res.error);
            }}
          >
            <Avatar square src={m.logo} name={m.name} className="size-6 text-[10px]" />
            <span className="flex-1 truncate">{m.name}</span>
            {m.id === activeOrgId && <span className="size-2 rounded-full bg-accent" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/onboarding?new=1&step=2")}>
          <Plus /> Create another company
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ user }: { user: { name: string; email: string; avatarUrl: string | null; isStaff: boolean } }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full focus-visible:outline-2" aria-label="Account menu">
        <Avatar src={user.avatarUrl} name={user.name} className="size-9" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/settings">
            <Settings /> Account settings
          </Link>
        </DropdownMenuItem>
        {user.isStaff && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <Shield /> Admin console
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/">
            <Home /> Public website
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await clearUserCaches();
            await signOutAction();
          }}
          className="text-destructive"
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

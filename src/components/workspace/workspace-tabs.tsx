"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Activity, CheckSquare, FileSignature, FileText, Flag, LayoutDashboard, MessageSquare, TrendingUp, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "", label: "Overview", icon: LayoutDashboard },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/milestones", label: "Milestones", icon: Flag },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/agreements", label: "Agreements", icon: FileSignature },
  { href: "/deals", label: "Deals", icon: TrendingUp },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/team", label: "Team", icon: Users },
];

export function WorkspaceTabs({ pid }: { pid: string }) {
  const pathname = usePathname();
  const base = `/dashboard/partnerships/${pid}`;
  return (
    <nav className="flex gap-1 overflow-x-auto border-t border-border px-3 scrollbar-thin" aria-label="Workspace sections">
      {TABS.map((t) => {
        const href = base + t.href;
        const active = t.href === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={t.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn("relative flex shrink-0 items-center gap-1.5 px-3 py-3 text-sm font-medium transition-colors", active ? "text-accent" : "text-slate-600 hover:text-slate-900")}
          >
            <t.icon className="size-4" />
            {t.label}
            {active && <motion.span layoutId="ws-tab" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" />}
          </Link>
        );
      })}
    </nav>
  );
}

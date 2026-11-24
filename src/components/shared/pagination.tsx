"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({ page, total, perPage, param = "page" }: { page: number; total: number; perPage: number; param?: string }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) return null;
  const href = (p: number) => {
    const next = new URLSearchParams(sp.toString());
    if (p === 1) next.delete(param);
    else next.set(param, String(p));
    const qs = next.toString();
    return `${pathname}${qs ? `?${qs}` : ""}`;
  };
  const windowPages = Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1);

  return (
    <nav className="flex items-center justify-center gap-1 pt-4" aria-label="Pagination">
      <Link
        aria-disabled={page <= 1}
        href={href(Math.max(1, page - 1))}
        className={cn("flex size-9 items-center justify-center rounded-lg border border-border bg-card", page <= 1 && "pointer-events-none opacity-40")}
        aria-label="Previous page"
      >
        <ChevronLeft className="size-4" />
      </Link>
      {windowPages.map((p, i) => (
        <span key={p} className="flex items-center">
          {i > 0 && windowPages[i - 1]! < p - 1 && <span className="px-1 text-slate-400">…</span>}
          <Link
            href={href(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn("flex size-9 items-center justify-center rounded-lg text-sm font-medium", p === page ? "bg-navy-900 text-white" : "border border-border bg-card hover:bg-secondary")}
          >
            {p}
          </Link>
        </span>
      ))}
      <Link
        aria-disabled={page >= pages}
        href={href(Math.min(pages, page + 1))}
        className={cn("flex size-9 items-center justify-center rounded-lg border border-border bg-card", page >= pages && "pointer-events-none opacity-40")}
        aria-label="Next page"
      >
        <ChevronRight className="size-4" />
      </Link>
    </nav>
  );
}

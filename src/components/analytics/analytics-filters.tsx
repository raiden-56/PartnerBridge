"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, FileSpreadsheet, FileText, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/primitives";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/overlays";

export function AnalyticsFilters({
  from,
  to,
  categories,
  partners,
  exportsAllowed,
}: {
  from: string;
  to: string;
  categories: { id: string; name: string }[];
  partners: { id: string; name: string }[];
  exportsAllowed: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const exportHref = (format: string) => `/api/analytics/export?format=${format}&${sp.toString()}`;

  return (
    <div className="mb-6 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)]">
      <label className="space-y-1 text-xs text-slate-500">
        From
        <Input type="date" value={from} onChange={(e) => set("from", e.target.value)} className="h-9 w-40" />
      </label>
      <label className="space-y-1 text-xs text-slate-500">
        To
        <Input type="date" value={to} onChange={(e) => set("to", e.target.value)} className="h-9 w-40" />
      </label>
      <label className="space-y-1 text-xs text-slate-500">
        Partnership type
        <NativeSelect value={sp.get("category") ?? ""} onChange={(e) => set("category", e.target.value)} className="h-9 w-44">
          <option value="">All types</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="space-y-1 text-xs text-slate-500">
        Partner company
        <NativeSelect value={sp.get("partner") ?? ""} onChange={(e) => set("partner", e.target.value)} className="h-9 w-44">
          <option value="">All partners</option>
          {partners.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="space-y-1 text-xs text-slate-500">
        Status
        <NativeSelect value={sp.get("status") ?? ""} onChange={(e) => set("status", e.target.value)} className="h-9 w-32">
          <option value="">Any</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="ended">Ended</option>
        </NativeSelect>
      </label>
      <div className="ml-auto">
        {exportsAllowed ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem asChild>
                <a href={exportHref("pdf")}>
                  <FileText /> PDF report
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={exportHref("csv")}>
                  <FileText /> CSV
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={exportHref("xlsx")}>
                  <FileSpreadsheet /> Excel (.xlsx)
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button variant="outline" onClick={() => router.push("/dashboard/billing")} title="Exports are available on the Business plan">
            <Lock /> Export (Business)
          </Button>
        )}
      </div>
    </div>
  );
}

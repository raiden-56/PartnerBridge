"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/primitives";
import { Checkbox } from "@/components/ui/overlays";
import type { Category } from "@/types/db";

export function OpportunityFilters({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = React.useState(sp.get("q") ?? "");
  const [loc, setLoc] = React.useState(sp.get("location") ?? "");
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return (
    <form
      className="grid gap-3 rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)] md:grid-cols-[1fr_200px_200px_auto_auto] md:items-center"
      onSubmit={(e) => {
        e.preventDefault();
        set({ q: q.trim() || null, location: loc.trim() || null });
      }}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search opportunities" className="pl-9" aria-label="Search opportunities" />
      </div>
      <NativeSelect aria-label="Category" value={sp.get("category") ?? ""} onChange={(e) => set({ category: e.target.value || null })}>
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.slug}>
            {c.name}
          </option>
        ))}
      </NativeSelect>
      <Input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Location e.g. Karnataka" aria-label="Location" />
      <label className="flex items-center gap-2 whitespace-nowrap px-1 text-sm">
        <Checkbox checked={sp.get("verified") === "1"} onCheckedChange={(c) => set({ verified: c ? "1" : null })} /> Verified only
      </label>
      <Button type="submit">Search</Button>
    </form>
  );
}

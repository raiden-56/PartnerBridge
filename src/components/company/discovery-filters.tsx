"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, LayoutGrid, List, Lock, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Badge } from "@/components/ui/primitives";
import { Checkbox } from "@/components/ui/overlays";
import { COMPANY_SIZES } from "@/lib/validation/schemas";
import { cn } from "@/lib/utils";
import type { Category, Industry } from "@/types/db";

export function DiscoveryToolbar({ total }: { total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = React.useState(sp.get("q") ?? "");

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    if (!("page" in patch)) next.delete("page");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const view = sp.get("view") ?? "grid";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <form
        className="relative flex-1"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          set({ q: q.trim() || null });
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search companies, products, services, locations…"
          className="h-11 pl-9 pr-24"
          aria-label="Search companies"
        />
        <Button type="submit" size="sm" className="absolute right-1.5 top-1/2 -translate-y-1/2">
          Search
        </Button>
      </form>
      <div className="flex items-center gap-2">
        <NativeSelect aria-label="Sort" className="h-11 w-44" value={sp.get("sort") ?? "relevance"} onChange={(e) => set({ sort: e.target.value })}>
          <option value="relevance">Most relevant</option>
          <option value="recent">Recently joined</option>
          <option value="active">Most active</option>
          <option value="verified">Verified first</option>
        </NativeSelect>
        <div className="flex rounded-lg border border-border bg-card p-1" role="group" aria-label="View">
          <button onClick={() => set({ view: null })} aria-pressed={view === "grid"} className={cn("rounded-md p-1.5", view === "grid" ? "bg-secondary text-slate-900" : "text-slate-400")} aria-label="Grid view">
            <LayoutGrid className="size-4" />
          </button>
          <button onClick={() => set({ view: "list" })} aria-pressed={view === "list"} className={cn("rounded-md p-1.5", view === "list" ? "bg-secondary text-slate-900" : "text-slate-400")} aria-label="List view">
            <List className="size-4" />
          </button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground sm:hidden">{total} companies</p>
    </div>
  );
}

export function DiscoveryFilters({
  industries,
  categories,
  advancedAllowed,
  advancedReason,
}: {
  industries: Industry[];
  categories: Category[];
  advancedAllowed: boolean;
  advancedReason: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const list = (k: string) => sp.getAll(k);
  const toggleList = (k: string, v: string) => {
    const next = new URLSearchParams(sp.toString());
    const cur = next.getAll(k);
    next.delete(k);
    (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).forEach((x) => next.append(k, x));
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const setOne = (k: string, v: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const active = Array.from(sp.keys()).filter((k) => !["q", "sort", "view", "page"].includes(k)).length;
  const parents = industries.filter((i) => !i.parent_id);

  const body = (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-slate-900">Filters</p>
        {active > 0 && (
          <button
            onClick={() => {
              const next = new URLSearchParams();
              ["q", "sort", "view"].forEach((k) => sp.get(k) && next.set(k, sp.get(k)!));
              router.push(`${pathname}?${next.toString()}`);
            }}
            className="text-xs font-medium text-accent hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={sp.get("verified") === "1"} onCheckedChange={(c) => setOne("verified", c ? "1" : null)} />
        Verified companies only
      </label>

      <FilterGroup title="Industry">
        <div className="max-h-52 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
          {parents.map((i) => (
            <label key={i.id} className="flex items-center gap-2 text-sm text-slate-700">
              <Checkbox checked={list("industry").includes(i.id)} onCheckedChange={() => toggleList("industry", i.id)} />
              {i.name}
            </label>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Partnership types offered">
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => {
            const on = list("offered").includes(c.slug);
            return (
              <button
                key={c.id}
                onClick={() => toggleList("offered", c.slug)}
                aria-pressed={on}
                className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", on ? "border-accent bg-accent text-white" : "border-border bg-card text-slate-600 hover:bg-slate-50")}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </FilterGroup>

      <Field label="Country">
        <Input defaultValue={sp.get("country") ?? ""} placeholder="e.g. India" onBlur={(e) => setOne("country", e.target.value.trim() || null)} onKeyDown={(e) => e.key === "Enter" && setOne("country", e.currentTarget.value.trim() || null)} />
      </Field>

      <div className="relative space-y-6 rounded-xl border border-dashed border-slate-300 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Advanced filters {!advancedAllowed && <Lock className="size-3" />}
        </p>
        {!advancedAllowed && <p className="text-xs text-muted-foreground">{advancedReason}</p>}
        <fieldset disabled={!advancedAllowed} className={cn("space-y-5", !advancedAllowed && "pointer-events-none opacity-50")}>
          <div className="grid grid-cols-2 gap-2">
            <Field label="State">
              <Input defaultValue={sp.get("state") ?? ""} onBlur={(e) => setOne("state", e.target.value.trim() || null)} />
            </Field>
            <Field label="City">
              <Input defaultValue={sp.get("city") ?? ""} onBlur={(e) => setOne("city", e.target.value.trim() || null)} />
            </Field>
          </div>
          <FilterGroup title="Company size">
            <div className="flex flex-wrap gap-1.5">
              {COMPANY_SIZES.map((s) => {
                const on = list("size").includes(s);
                return (
                  <button key={s} onClick={() => toggleList("size", s)} aria-pressed={on} className={cn("rounded-md border px-2 py-1 text-xs", on ? "border-accent bg-blue-50 text-accent" : "border-border bg-card text-slate-600")}>
                    {s}
                  </button>
                );
              })}
            </div>
          </FilterGroup>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Founded from">
              <Input type="number" defaultValue={sp.get("from") ?? ""} onBlur={(e) => setOne("from", e.target.value || null)} />
            </Field>
            <Field label="Founded to">
              <Input type="number" defaultValue={sp.get("to") ?? ""} onBlur={(e) => setOne("to", e.target.value || null)} />
            </Field>
          </div>
          <FilterGroup title="Partnership types wanted">
            <NativeSelect value={list("wanted")[0] ?? ""} onChange={(e) => setOne("wanted", e.target.value || null)}>
              <option value="">Any</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </FilterGroup>
          <Field label="Capability" hint="Exact capability tag, e.g. SEO">
            <Input defaultValue={sp.get("capability") ?? ""} onBlur={(e) => setOne("capability", e.target.value.trim() || null)} />
          </Field>
          <Field label="Target market" hint="e.g. SMBs, Retail">
            <Input defaultValue={sp.get("market") ?? ""} onBlur={(e) => setOne("market", e.target.value.trim() || null)} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={sp.get("open") === "1"} onCheckedChange={(c) => setOne("open", c ? "1" : null)} />
            Currently open to partnerships
          </label>
        </fieldset>
      </div>
    </div>
  );

  return (
    <>
      <div className="lg:hidden">
        <Button variant="outline" onClick={() => setMobileOpen((o) => !o)} className="w-full">
          <Filter /> Filters {active > 0 && <Badge variant="accent">{active}</Badge>}
          {mobileOpen && <X className="ml-auto" />}
        </Button>
        {mobileOpen && <div className="mt-3 rounded-xl border border-border bg-card p-4">{body}</div>}
      </div>
      <aside className="hidden lg:block">{body}</aside>
    </>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {children}
    </div>
  );
}

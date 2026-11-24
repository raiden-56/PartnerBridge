"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";

export interface PlanView {
  id: string;
  code: string;
  name: string;
  tagline: string | null;
  price_monthly: number;
  price_yearly: number;
  is_custom_pricing: boolean;
  trial_days: number;
  features: string[];
}

export function PricingPlans({
  plans,
  ctaFor,
}: {
  plans: PlanView[];
  /** Override the CTA (e.g. checkout buttons on the billing page). */
  ctaFor?: (plan: PlanView, cycle: "monthly" | "yearly") => React.ReactNode;
}) {
  const [cycle, setCycle] = React.useState<"monthly" | "yearly">("monthly");
  return (
    <div>
      <div className="mb-10 flex justify-center">
        <div className="inline-flex rounded-full border border-border bg-white p-1 shadow-sm" role="radiogroup" aria-label="Billing cycle">
          {(["monthly", "yearly"] as const).map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={cycle === c}
              onClick={() => setCycle(c)}
              className={cn("rounded-full px-4 py-1.5 text-sm font-medium transition-colors", cycle === c ? "bg-navy-900 text-white" : "text-slate-600 hover:text-slate-900")}
            >
              {c === "monthly" ? "Monthly" : "Yearly"}
              {c === "yearly" && <span className="ml-1.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">2 months free</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const popular = p.code === "growth";
          const price = cycle === "monthly" ? p.price_monthly : p.price_yearly;
          return (
            <div
              key={p.id}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-card p-6 shadow-[var(--shadow-card)]",
                popular ? "border-accent ring-4 ring-accent/10" : "border-border",
              )}
            >
              {popular && (
                <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-white">
                  <Sparkles className="size-3" /> Most popular
                </span>
              )}
              <h3 className="text-lg font-bold text-slate-900">{p.name}</h3>
              <p className="mt-1 min-h-10 text-sm text-muted-foreground">{p.tagline}</p>
              <div className="mt-5 flex items-baseline gap-1">
                {p.is_custom_pricing ? (
                  <span className="font-display text-3xl font-bold text-slate-900">Custom</span>
                ) : (
                  <>
                    <span className="font-display text-4xl font-bold text-slate-900">{formatCurrency(price)}</span>
                    {Number(price) > 0 && <span className="text-sm text-muted-foreground">/{cycle === "monthly" ? "month" : "year"}</span>}
                  </>
                )}
              </div>
              {Number(price) > 0 && <p className="mt-1 text-xs text-muted-foreground">+ applicable GST{p.trial_days ? ` · ${p.trial_days}-day free trial` : ""}</p>}
              <ul className="mt-6 flex-1 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2 text-sm text-slate-700">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {ctaFor ? (
                  ctaFor(p, cycle)
                ) : (
                  <Button asChild className="w-full" variant={popular ? "accent" : "outline"}>
                    <Link href={p.is_custom_pricing ? "/#contact" : `/register?plan=${p.code}`}>{p.is_custom_pricing ? "Contact sales" : p.code === "free" ? "Start free" : "Get started"}</Link>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">Proposed launch pricing in INR. Prices may change before general availability.</p>
    </div>
  );
}

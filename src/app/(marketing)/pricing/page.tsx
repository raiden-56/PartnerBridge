import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { Faq } from "@/components/marketing/faq";
import { getPublicPlans } from "@/lib/queries/reference";
import { LIMIT_KEYS, type LimitKey } from "@/lib/billing/limits";

export const metadata: Metadata = { title: "Pricing", description: "Simple plans for companies of every size. Start free." };

export default async function PricingPage() {
  const plans = await getPublicPlans();
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">Pricing</p>
        <h1 className="mt-2 text-4xl font-bold text-slate-900">Start free. Grow with your partner network.</h1>
        <p className="mt-4 text-muted-foreground">All plans include a public company profile, secure partnership workspaces and real-time messaging.</p>
      </div>
      <PricingPlans plans={plans} />

      <div className="mt-20 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-slate-50">
              <th className="p-4 text-left font-semibold">Compare limits</th>
              {plans.map((p) => (
                <th key={p.id} className="p-4 text-center font-semibold">
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(Object.keys(LIMIT_KEYS) as LimitKey[]).map((k) => (
              <tr key={k} className="border-b border-border last:border-0">
                <td className="p-4 text-slate-700">{LIMIT_KEYS[k].label}</td>
                {plans.map((p) => {
                  const v = (p.limits as Record<string, number>)[k];
                  return (
                    <td key={p.id} className="p-4 text-center tabular-nums">
                      {LIMIT_KEYS[k].kind === "flag" ? (
                        v ? <Check className="mx-auto size-4 text-success" aria-label="Included" /> : <Minus className="mx-auto size-4 text-slate-300" aria-label="Not included" />
                      ) : v === undefined ? (
                        "—"
                      ) : v < 0 ? (
                        "Unlimited"
                      ) : (
                        v.toLocaleString("en-IN")
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mx-auto mt-20 max-w-3xl">
        <h2 className="mb-6 text-center text-2xl font-bold">Frequently asked questions</h2>
        <Faq />
      </div>
    </div>
  );
}

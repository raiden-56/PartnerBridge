"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PricingPlans, type PlanView } from "@/components/marketing/pricing-plans";
import { CheckoutButton, TrialButton } from "./checkout-button";

export function BillingPlanGrid({ plans, currentCode, trialAvailable, paymentsReady }: { plans: PlanView[]; currentCode: string; trialAvailable: boolean; paymentsReady: boolean }) {
  return (
    <PricingPlans
      plans={plans}
      ctaFor={(p, cycle) => {
        if (p.code === currentCode)
          return (
            <Button className="w-full" variant="outline" disabled>
              Current plan
            </Button>
          );
        if (p.is_custom_pricing)
          return (
            <Button asChild className="w-full" variant="outline">
              <Link href="/#contact">Contact sales</Link>
            </Button>
          );
        if (p.code === "free")
          return (
            <p className="text-center text-xs text-muted-foreground">Cancel your paid plan to return to Free at the end of the period.</p>
          );
        return (
          <div className="space-y-1.5">
            <CheckoutButton planCode={p.code} cycle={cycle} label={currentCode === "free" ? `Upgrade to ${p.name}` : `Switch to ${p.name}`} disabled={!paymentsReady} />
            {trialAvailable && p.trial_days > 0 && <TrialButton planCode={p.code} days={p.trial_days} />}
          </div>
        );
      }}
    />
  );
}

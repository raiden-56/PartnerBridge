"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, Check, FileText, Flag, Handshake, Rocket, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { useAction } from "@/components/shared/use-action";
import {
  CompanyInfoForm,
  DescriptionForm,
  GoalsForm,
  PersonalForm,
  PreferencesForm,
  VerificationForm,
  type CompanyRecord,
} from "@/components/company/forms";
import { publishProfileAction } from "@/actions/organization";
import { cn } from "@/lib/utils";
import type { Category, Industry, VerificationStatus } from "@/types/db";

const STEPS = [
  { n: 1, title: "About you", icon: User, desc: "Tell partners who they'll be working with." },
  { n: 2, title: "Company", icon: Building2, desc: "Basic company information and headquarters." },
  { n: 3, title: "Description", icon: FileText, desc: "What you do, who you serve and what you offer." },
  { n: 4, title: "Partnerships", icon: Handshake, desc: "The partnership types you offer and seek." },
  { n: 5, title: "Goals", icon: Flag, desc: "What you want to achieve through partnerships." },
  { n: 6, title: "Verification", icon: ShieldCheck, desc: "Optional now — verified companies earn more trust." },
  { n: 7, title: "Publish", icon: Rocket, desc: "Review and go live in the marketplace." },
];

export function OnboardingWizard({
  initialStep,
  profile,
  company,
  verification,
  industries,
  categories,
}: {
  initialStep: number;
  profile: { fullName: string; designation: string; phone: string; avatarUrl: string | null; email: string };
  company: CompanyRecord | null;
  verification: { status: VerificationStatus; reviewer_notes?: string | null; domain?: string | null; domain_verification_token?: string | null } | null;
  industries: Industry[];
  categories: Category[];
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(initialStep);
  const maxReached = company ? Math.max(company.onboarding_step ?? 1, step) : Math.max(step, profile.designation ? 2 : 1);
  const publish = useAction(publishProfileAction, { refresh: false });

  const go = (n: number) => {
    setStep(n);
    router.replace(`/onboarding?step=${n}`, { scroll: false });
    router.refresh();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const current = STEPS[step - 1]!;
  const needsCompany = step >= 3 && !company;

  return (
    <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
      <nav aria-label="Onboarding steps" className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Set up your company</p>
        <ol className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-1 lg:pb-0">
          {STEPS.map((s) => {
            const done = s.n < maxReached && s.n !== step;
            const reachable = s.n <= maxReached && (s.n <= 2 || company);
            return (
              <li key={s.n} className="shrink-0">
                <button
                  disabled={!reachable}
                  onClick={() => go(s.n)}
                  aria-current={s.n === step ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    s.n === step ? "bg-white font-semibold text-slate-900 shadow-sm ring-1 ring-border" : "text-slate-600 hover:bg-white/70",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs",
                      s.n === step ? "border-accent bg-accent text-white" : done ? "border-green-500 bg-green-500 text-white" : "border-slate-300 bg-white",
                    )}
                  >
                    {done ? <Check className="size-3.5" /> : s.n}
                  </span>
                  <span className="hidden sm:inline">{s.title}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 hidden text-xs text-muted-foreground lg:block">Progress is saved after every step — you can leave and continue later.</p>
      </nav>

      <Card className="overflow-hidden">
        <div className="border-b border-border bg-gradient-to-r from-slate-50 to-white px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-accent">
              <current.icon className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">
                Step {step} of {STEPS.length}
              </p>
              <h1 className="text-xl font-bold text-slate-900">{current.title}</h1>
            </div>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{current.desc}</p>
        </div>
        <div className="p-6">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
              {needsCompany ? (
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Create your company first.</p>
                  <Button className="mt-4" onClick={() => go(2)}>
                    Go to company details
                  </Button>
                </div>
              ) : step === 1 ? (
                <PersonalForm profile={profile} onSaved={() => go(2)} />
              ) : step === 2 ? (
                <CompanyInfoForm company={company} industries={industries} onSaved={() => go(3)} />
              ) : step === 3 ? (
                <DescriptionForm company={company!} onSaved={() => go(4)} />
              ) : step === 4 ? (
                <PreferencesForm company={company!} categories={categories} onSaved={() => go(5)} />
              ) : step === 5 ? (
                <GoalsForm company={company!} onSaved={() => go(6)} />
              ) : step === 6 ? (
                <div className="space-y-6">
                  <VerificationForm company={company!} verification={verification} onSaved={() => go(7)} />
                  <div className="flex justify-between border-t border-border pt-4">
                    <Button variant="ghost" onClick={() => go(5)}>
                      Back
                    </Button>
                    <Button variant="outline" onClick={() => go(7)}>
                      Skip for now
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ["Company", company?.name],
                      ["Location", [company?.city, company?.country].filter(Boolean).join(", ")],
                      ["Size", company?.company_size ? `${company.company_size} employees` : "—"],
                      ["Partnership types", `${company?.prefs?.length ?? 0} selected`],
                      ["Products & services", `${company?.services?.length ?? 0} listed`],
                      ["Verification", company?.verification_status?.replace("_", " ")],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-lg border border-border p-3">
                        <p className="text-xs text-muted-foreground">{k}</p>
                        <p className="mt-0.5 text-sm font-medium capitalize text-slate-900">{v || "—"}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Publishing makes your company profile discoverable by other businesses. Private details (email, phone, address, documents) stay hidden unless you
                    choose otherwise in Privacy settings.
                  </p>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button
                      variant="outline"
                      onClick={async () => {
                        router.push("/dashboard");
                      }}
                    >
                      Save as draft
                    </Button>
                    <Button
                      variant="accent"
                      loading={publish.pending}
                      onClick={async () => {
                        const res = await publish.run(company!.id, true);
                        if (res.ok) router.push("/dashboard?welcome=1");
                      }}
                    >
                      <Rocket /> Publish company profile
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </Card>
    </div>
  );
}

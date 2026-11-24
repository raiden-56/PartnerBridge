import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/shared/common";
import { OnboardingWizard } from "@/components/onboarding/wizard";
import { requireUserPage, getOrgContext } from "@/lib/auth/session";
import { getCategories, getEditableCompany, getIndustries } from "@/lib/queries/reference";
import { signOutAction } from "@/actions/auth";
import { LocalDemoBar } from "@/components/demo/local-demo-bar";

export const metadata: Metadata = { title: "Set up your company" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string; new?: string }> }) {
  const { profile } = await requireUserPage("/onboarding");
  const sp = await searchParams;
  const ctx = await getOrgContext();
  const creatingNew = sp.new === "1";

  if (ctx && !creatingNew && ctx.role !== "owner" && ctx.role !== "admin") redirect("/dashboard");

  const company = ctx && !creatingNew ? await getEditableCompany(ctx.orgId) : null;
  if (company?.org && company.org.profile_status === "published" && profile.onboarding_completed && !sp.step) redirect("/dashboard");

  const [industries, categories] = await Promise.all([getIndustries(), getCategories()]);
  const initialStep = Math.min(7, Math.max(1, Number(sp.step) || (company?.org ? company.org.onboarding_step : profile.full_name && profile.designation ? 2 : 1)));

  return (
    <div className="min-h-dvh bg-background">
      <LocalDemoBar />
      <header className="sticky top-0 z-30 border-b border-border bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Link href="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {ctx && (
              <Link href="/dashboard" className="text-muted-foreground hover:text-slate-900">
                Save & exit
              </Link>
            )}
            <form action={signOutAction}>
              <button className="text-muted-foreground hover:text-slate-900">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <OnboardingWizard
          initialStep={initialStep}
          profile={{ fullName: profile.full_name ?? "", designation: profile.designation ?? "", phone: profile.phone ?? "", avatarUrl: profile.avatar_url, email: profile.email }}
          company={company?.org ? { ...company.org, contacts: company.contacts, services: company.services, prefs: company.prefs } : null}
          verification={company?.verification ?? null}
          industries={industries}
          categories={categories}
        />
      </main>
    </div>
  );
}

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Briefcase,
  Building2,
  FileSignature,
  Handshake,
  Lock,
  MessagesSquare,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { FadeIn, InView } from "@/components/shared/motion";
import { NetworkGraph } from "@/components/marketing/network-graph";
import { CompanyCard } from "@/components/company/company-card";
import { OpportunityCard } from "@/components/opportunities/opportunity-card";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { Faq } from "@/components/marketing/faq";
import { ContactForm } from "@/components/marketing/contact-form";
import { CategoryIcon } from "@/components/shared/category-icon";
import { getFeaturedCompanies, getPublicStats, listOpportunities } from "@/lib/queries/marketplace";
import { getCategories, getPublicPlans } from "@/lib/queries/reference";
import { getUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";


const STEPS = [
  { icon: Search, title: "Discover", text: "Search companies by industry, location, capabilities and the partnership types they offer or seek." },
  { icon: MessagesSquare, title: "Connect", text: "Send a structured partnership request with your proposal, expected benefits and commercial model." },
  { icon: FileSignature, title: "Negotiate", text: "Discuss terms in a private conversation before committing to anything." },
  { icon: Handshake, title: "Establish", text: "Accepting a request instantly creates a private, shared partnership workspace." },
  { icon: Users, title: "Collaborate", text: "Share tasks, milestones, documents and agreements with both teams." },
  { icon: TrendingUp, title: "Grow", text: "Register deals and referrals and measure what every partnership delivers." },
];

const WHY = [
  { icon: Target, title: "Built for partnerships, not just networking", text: "Structured requests, applications, workspaces and deal tracking replace scattered emails and spreadsheets." },
  { icon: Sparkles, title: "Transparent matching", text: "Recommendations show exactly why a company fits — no black-box scores." },
  { icon: Lock, title: "Private by design", text: "Tenant isolation and row-level security keep every company's data, documents and conversations private." },
  { icon: BarChart3, title: "Measure real outcomes", text: "Track pipeline, attributed revenue and partner-verified revenue separately — no inflated numbers." },
];

const STORIES = [
  {
    title: "Website + marketing bundles",
    a: "Northstar Digital Solutions",
    b: "BrightWave Marketing",
    text: "A web development studio and a digital marketing agency offer joint launch packages and refer clients both ways, tracking every referral as a deal in their shared workspace.",
  },
  {
    title: "Regional food distribution",
    a: "GreenLeaf Foods",
    b: "BluePeak Distributors",
    text: "A packaged-food manufacturer appoints a distributor for Karnataka, sharing price lists and agreements, and tracking onboarding milestones for each retail cluster.",
  },
  {
    title: "Cold-chain logistics alliance",
    a: "GreenLeaf Foods",
    b: "Apex Logistics",
    text: "A supply-chain partnership coordinates temperature-controlled deliveries, with shared tasks for route planning and an agreement record for service levels.",
  },
];

export default async function HomePage() {
  const configured = isSupabaseConfigured();
  const [user, featured, opps, stats, categories, plans] = configured
    ? await Promise.all([getUser(), getFeaturedCompanies(6), listOpportunities({ perPage: 6 }), getPublicStats(), getCategories(), getPublicPlans()])
    : [null, [], { items: [], total: 0 }, null, [], []];

  const launchStage = !stats || stats.companies < 100;

  return (
    <>
      {/* ─── Hero ───────────────────────────────────────────────── */}
      <section className="relative -mt-16 overflow-hidden bg-hero pt-16">
        <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <FadeIn>
            <Badge variant="accent" className="mb-5 px-3 py-1 text-xs">
              <Handshake /> The open B2B partnership marketplace
            </Badge>
            <h1 className="text-4xl font-extrabold leading-[1.08] text-slate-900 text-balance sm:text-5xl lg:text-6xl">
              Great Businesses Grow <span className="bg-gradient-to-r from-accent to-indigo-600 bg-clip-text text-transparent">Better Together.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-slate-600">
              Discover trusted business partners, unlock new opportunities and build meaningful collaborations with companies around the world.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" variant="accent">
                <Link href="/companies">
                  <Search /> Find Business Partners
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={user ? "/dashboard/company" : "/register"}>
                  <Building2 /> List Your Company
                </Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-success" /> Manually reviewed verification
              </span>
              <span className="flex items-center gap-1.5">
                <Lock className="size-4 text-success" /> Private partner workspaces
              </span>
              <span className="flex items-center gap-1.5">
                <BadgeCheck className="size-4 text-success" /> Free to start
              </span>
            </div>
          </FadeIn>
          <FadeIn delay={0.15}>
            <NetworkGraph companies={featured.map((f) => ({ name: f.name, industry: f.industry?.name }))} />
          </FadeIn>
        </div>
      </section>

      {/* ─── Platform statistics (real data) ────────────────────── */}
      <section className="border-y border-border bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {[
              ["Companies listed", stats?.companies ?? 0],
              ["Verified companies", stats?.verified_companies ?? 0],
              ["Open opportunities", stats?.open_opportunities ?? 0],
              ["Industries represented", stats?.industries ?? 0],
            ].map(([label, value]) => (
              <div key={label as string} className="text-center">
                <p className="font-display text-3xl font-bold text-navy-900 tabular-nums">{Number(value).toLocaleString("en-IN")}</p>
                <p className="mt-1 text-sm text-slate-500">{label}</p>
              </div>
            ))}
          </div>
          {launchStage && (
            <p className="mt-6 text-center text-xs text-slate-500">
              🚀 PartnerBridge is in its launch stage — these numbers are live from our database
              {stats?.demo_companies ? `, and include ${stats.demo_companies} clearly labelled demo companies` : ""}. Be among the first companies to list.
            </p>
          )}
        </div>
      </section>

      {/* ─── Featured companies ─────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <InView className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-accent">Featured companies</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-900">Companies looking to partner</h2>
          </div>
          <Button asChild variant="outline">
            <Link href="/companies">
              Explore all companies <ArrowRight />
            </Link>
          </Button>
        </InView>
        {featured.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((o) => (
              <CompanyCard key={o.id} org={o} categories={categories} signedIn={!!user} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">No companies listed yet — be the first!</p>
        )}
      </section>

      {/* ─── How it works ───────────────────────────────────────── */}
      <section className="bg-navy-900 py-20 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <InView className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-blue-300">How PartnerBridge works</p>
            <h2 className="mt-2 text-3xl font-bold">Discover → Connect → Negotiate → Establish → Collaborate → Grow</h2>
          </InView>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <InView key={s.title} delay={i * 0.05} className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent/90">
                    <s.icon className="size-5" />
                  </span>
                  <span className="text-xs font-semibold text-blue-300">STEP {i + 1}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-blue-100/80">{s.text}</p>
              </InView>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Categories ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <InView className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">Partnership categories</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">Every kind of business collaboration</h2>
        </InView>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/companies?offered=${c.slug}`}
              className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[var(--shadow-lift)]"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
                <CategoryIcon name={c.icon} className="size-[18px]" />
              </span>
              <span className="text-sm font-semibold text-slate-900">{c.name}</span>
              <span className="line-clamp-2 text-xs text-slate-500">{c.description}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── Latest opportunities ───────────────────────────────── */}
      <section className="border-y border-border bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <InView className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-accent">Latest opportunities</p>
              <h2 className="mt-2 text-3xl font-bold text-slate-900">Companies actively seeking partners</h2>
            </div>
            <Button asChild variant="outline">
              <Link href="/opportunities">
                <Briefcase /> Browse opportunities
              </Link>
            </Button>
          </InView>
          {opps.items.length ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {opps.items.map((o) => (
                <OpportunityCard key={o.id} opp={o} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">No open opportunities right now.</p>
          )}
        </div>
      </section>

      {/* ─── Why & trust ────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-accent">Why businesses choose PartnerBridge</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-900">From first introduction to measurable results</h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              {WHY.map((w) => (
                <InView key={w.title}>
                  <w.icon className="size-6 text-accent" />
                  <h3 className="mt-3 font-semibold text-slate-900">{w.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{w.text}</p>
                </InView>
              ))}
            </div>
          </div>
          <InView className="rounded-3xl border border-border bg-gradient-to-br from-white to-blue-50/60 p-8 shadow-[var(--shadow-card)]">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-success/10 text-success">
              <ShieldCheck className="size-6" />
            </div>
            <h3 className="mt-5 text-2xl font-bold text-slate-900">Trust & company verification</h3>
            <p className="mt-2 text-slate-600">Verification is earned, not uploaded. Every request is reviewed by our moderation team.</p>
            <ul className="mt-6 space-y-4 text-sm">
              {[
                ["Registration check", "Business registration number, type and country are reviewed against submitted documents."],
                ["Domain ownership", "Companies can prove they control their website domain with a DNS record."],
                ["Authorised representative", "A named representative confirms they can act for the company."],
                ["Ongoing moderation", "Reporting, blocking and audit logs keep the marketplace safe."],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <BadgeCheck className="mt-0.5 size-5 shrink-0 text-accent" />
                  <span>
                    <strong className="text-slate-900">{t}.</strong> <span className="text-slate-600">{d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </InView>
        </div>
      </section>

      {/* ─── Example partnership stories (illustrative) ─────────── */}
      <section className="border-y border-border bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <InView className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-accent">Partnership stories</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-900">What partnerships on PartnerBridge look like</h2>
            <p className="mt-3 text-sm text-muted-foreground">Illustrative scenarios using our fictional demo companies — not testimonials from real customers.</p>
          </InView>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {STORIES.map((s) => (
              <InView key={s.title} className="flex flex-col rounded-2xl border border-border bg-slate-50/50 p-6">
                <Badge variant="violet" className="self-start">
                  Example scenario
                </Badge>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-2 flex-1 text-sm text-slate-600">{s.text}</p>
                <p className="mt-5 text-xs font-medium text-slate-500">
                  {s.a} <span className="text-accent">×</span> {s.b}
                </p>
              </InView>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6" id="pricing">
        <InView className="mx-auto mb-10 max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">Subscription plans</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">Start free. Upgrade as your partner network grows.</h2>
        </InView>
        <PricingPlans plans={plans} />
      </section>

      {/* ─── FAQ & contact ──────────────────────────────────────── */}
      <section className="border-t border-border bg-white py-20" id="contact">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-accent">FAQ</p>
            <h2 className="mt-2 mb-8 text-3xl font-bold text-slate-900">Questions, answered</h2>
            <Faq />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-accent">Contact</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-900">Talk to us</h2>
            <p className="mb-8 mt-2 text-slate-600">Enterprise plans, partnerships programmes or questions — we&apos;re happy to help.</p>
            <ContactForm />
          </div>
        </div>
      </section>

      {/* ─── CTA ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-navy-900 px-8 py-14 text-center text-white sm:px-16">
          <div className="absolute -right-20 -top-20 size-72 rounded-full bg-accent/40 blur-3xl" />
          <div className="absolute -bottom-24 -left-10 size-72 rounded-full bg-indigo-400/20 blur-3xl" />
          <h2 className="relative text-3xl font-bold sm:text-4xl">Your next great partner is already here.</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-blue-100">List your company in minutes and start discovering partners today.</p>
          <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" variant="accent">
              <Link href="/register">Get started free</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20">
              <Link href="/companies">Browse companies</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Building2, FileSignature, Handshake, LineChart, MessagesSquare, Search, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InView } from "@/components/shared/motion";

export const metadata: Metadata = { title: "How It Works", description: "How PartnerBridge takes you from discovery to measurable partnership results." };

const STAGES = [
  { icon: Building2, title: "1. List your company", text: "Create a company profile with your industry, services, capabilities, locations and the partnership types you offer and seek. Submit verification documents to earn the verified badge." },
  { icon: Search, title: "2. Discover", text: "Search the marketplace with filters for industry, location, size, founding year, capabilities and partnership types — or let smart matching suggest complementary companies with transparent reasons." },
  { icon: Briefcase, title: "3. Publish or apply to opportunities", text: "Post what you need (e.g. ‘distribution partners in Karnataka’) and review applications, or apply to other companies' opportunities with a tailored proposal." },
  { icon: MessagesSquare, title: "4. Connect & negotiate", text: "Send structured partnership requests including proposed collaboration, benefits and commercial model. Recipients can accept, decline or start a private discussion." },
  { icon: Handshake, title: "5. Establish", text: "Accepting a request or application creates exactly one partnership and a private workspace that only the two companies' authorised members can access." },
  { icon: Users, title: "6. Collaborate", text: "Share tasks, milestones, versioned documents and agreements. Assign responsibilities to either company, comment, and keep everyone on the same page with real-time messaging." },
  { icon: FileSignature, title: "7. Formalise", text: "Record agreements with commercial terms, effective and expiry dates, versions and approvals from both companies. Connect an e-signature provider for legally binding signatures." },
  { icon: LineChart, title: "8. Grow & measure", text: "Register deals and referrals and track estimated pipeline, attributed revenue and partner-verified revenue — separately, so results are never inflated." },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">How it works</p>
        <h1 className="mt-2 text-4xl font-bold text-slate-900">From first introduction to a thriving partnership</h1>
        <p className="mt-4 text-lg text-muted-foreground">Discover → Connect → Negotiate → Establish → Collaborate → Grow</p>
      </div>
      <ol className="relative mt-14 space-y-8 border-l-2 border-blue-100 pl-8">
        {STAGES.map((s, i) => (
          <InView key={s.title} delay={i * 0.03} className="relative">
            <span className="absolute -left-[53px] flex size-10 items-center justify-center rounded-xl bg-accent text-white shadow-lg shadow-blue-500/20">
              <s.icon className="size-5" />
            </span>
            <h2 className="text-xl font-semibold text-slate-900">{s.title}</h2>
            <p className="mt-1.5 text-slate-600">{s.text}</p>
          </InView>
        ))}
      </ol>
      <div className="mt-16 grid gap-5 sm:grid-cols-3">
        {[
          { icon: ShieldCheck, t: "Private by default", d: "Contact details, documents and conversations are visible only to authorised people." },
          { icon: Sparkles, t: "Transparent matching", d: "Every recommendation shows exactly which factors contributed to the score." },
          { icon: Users, t: "Built for teams", d: "Owners, admins, partnership managers and members with granular permissions." },
        ].map((f) => (
          <div key={f.t} className="rounded-2xl border border-border bg-card p-6">
            <f.icon className="size-6 text-accent" />
            <p className="mt-3 font-semibold">{f.t}</p>
            <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
          </div>
        ))}
      </div>
      <div className="mt-14 text-center">
        <Button asChild size="lg" variant="accent">
          <Link href="/register">List your company free</Link>
        </Button>
      </div>
    </div>
  );
}

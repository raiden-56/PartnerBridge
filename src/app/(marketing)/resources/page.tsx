import type { Metadata } from "next";
import { BookOpen, CheckCircle2, FileText, Handshake, Lightbulb, Target } from "lucide-react";

export const metadata: Metadata = { title: "Resources", description: "Practical guides for finding, structuring and managing business partnerships." };

const GUIDES = [
  {
    icon: Target,
    title: "Writing a partnership request that gets accepted",
    points: [
      "Personalise the first two lines — reference something specific about their business.",
      "Describe one concrete collaboration, not a list of possibilities.",
      "State what's in it for them: customers, revenue, capability or market access.",
      "Propose a commercial model, even a draft one — it signals seriousness.",
      "Suggest a small first step such as a pilot, a joint webinar or a single referral.",
    ],
  },
  {
    icon: Handshake,
    title: "Choosing the right partnership type",
    points: [
      "Referral: lowest commitment — share leads for a fee or reciprocity.",
      "Reseller / distributor: they sell your product; agree margins, territory and support.",
      "Technology / integration: build a product connection for shared customers.",
      "Strategic alliance / JV: long-term, multi-team commitments with governance.",
      "White-label / manufacturing: one company builds, the other brands and sells.",
    ],
  },
  {
    icon: FileText,
    title: "What every partnership agreement should cover",
    points: [
      "Scope, responsibilities and exclusivity (if any).",
      "Commercial terms: fees, margins, payment cycles and taxes (GST).",
      "Territory, term, renewal and termination conditions.",
      "Data protection obligations, confidentiality and IP ownership.",
      "Dispute resolution and governing law. Always get legal review.",
    ],
  },
  {
    icon: Lightbulb,
    title: "Running the first 90 days",
    points: [
      "Assign a primary contact on each side in the workspace.",
      "Agree 3–5 milestones with dates and owners.",
      "Hold a short weekly check-in and track tasks in the shared board.",
      "Register every referral and deal as soon as it starts.",
      "Review results at day 90: what worked, what to change, whether to expand.",
    ],
  },
];

export default function ResourcesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">Resources</p>
        <h1 className="mt-2 text-4xl font-bold text-slate-900">Partnership playbooks</h1>
        <p className="mt-4 text-muted-foreground">Practical, no-fluff guidance for building partnerships that deliver results.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {GUIDES.map((g) => (
          <article key={g.title} className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
            <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-accent">
              <g.icon className="size-5" />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-slate-900">{g.title}</h2>
            <ul className="mt-3 space-y-2">
              {g.points.map((p) => (
                <li key={p} className="flex gap-2 text-sm text-slate-600">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> {p}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <p className="mt-10 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
        <BookOpen className="size-4" /> These guides are general information, not legal or financial advice.
      </p>
    </div>
  );
}

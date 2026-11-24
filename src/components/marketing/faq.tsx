import { ChevronDown } from "lucide-react";

export const FAQ_ITEMS = [
  {
    q: "Who can join PartnerBridge?",
    a: "Any registered business — from startups to enterprises — looking to find partners, be discovered by partners, or manage existing collaborations. It's an open marketplace, not a single company's partner portal.",
  },
  {
    q: "What does the “Verified” badge mean?",
    a: "Our team has reviewed the company's registration details and documents. Uploading documents alone never grants the badge — every verification is reviewed and can be revoked.",
  },
  {
    q: "Who can see my company's private information?",
    a: "Only your team. Email, phone and address stay private unless you choose to show them, and partnership workspaces, documents and messages are visible only to authorised members of the two participating companies.",
  },
  {
    q: "How does smart partner matching work?",
    a: "It's a transparent, rule-based score that compares partnership types offered and wanted, complementary industries, goals, geography, company size and target markets. Every recommendation shows exactly why it was suggested.",
  },
  {
    q: "Are agreement approvals legally binding e-signatures?",
    a: "No. Approval buttons record internal acceptance by each company. For legally valid electronic signatures, connect a supported e-signature provider or sign outside the platform and upload the executed copy.",
  },
  {
    q: "Can I cancel or change my plan?",
    a: "Yes. You can upgrade, downgrade or cancel anytime from Billing. Cancellations take effect at the end of the paid period, and you keep access to your data.",
  },
  {
    q: "Does PartnerBridge work on mobile?",
    a: "Yes — PartnerBridge is an installable Progressive Web App for Android, iOS, tablets and desktops, with offline access to public pages and push notifications.",
  },
];

export function Faq() {
  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
      {FAQ_ITEMS.map((f) => (
        <details key={f.q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left font-medium text-slate-900">
            {f.q}
            <ChevronDown className="size-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

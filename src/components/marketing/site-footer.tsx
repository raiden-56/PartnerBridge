import Link from "next/link";
import { Logo } from "@/components/shared/common";

const COLUMNS = [
  {
    title: "Platform",
    links: [
      ["Discover companies", "/companies"],
      ["Opportunities", "/opportunities"],
      ["How it works", "/how-it-works"],
      ["Pricing", "/pricing"],
    ],
  },
  {
    title: "Partnership types",
    links: [
      ["Distributors", "/companies?wanted=distributor"],
      ["Resellers", "/companies?offered=reseller"],
      ["Technology partners", "/companies?offered=technology"],
      ["Marketing partners", "/companies?offered=marketing"],
    ],
  },
  {
    title: "Company",
    links: [
      ["Resources", "/resources"],
      ["Contact", "/#contact"],
      ["Privacy policy", "/privacy"],
      ["Terms of service", "/terms"],
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">
            The open B2B partnership marketplace. Discover, connect, negotiate, establish, collaborate and grow — together.
          </p>
          <p className="text-xs text-slate-400">Made in India for businesses everywhere.</p>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <p className="text-sm font-semibold text-slate-900">{c.title}</p>
            <ul className="mt-4 space-y-2.5">
              {c.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-slate-600 hover:text-accent">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} PartnerBridge. All rights reserved.</p>
          <p>Sample companies marked “Demo” are fictional and shown for demonstration only.</p>
        </div>
      </div>
    </footer>
  );
}

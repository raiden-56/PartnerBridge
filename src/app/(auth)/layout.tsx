import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/shared/common";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <main id="main" className="flex flex-col px-5 py-8 sm:px-10">
        <Link href="/" aria-label="PartnerBridge home">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
        <p className="text-center text-xs text-slate-400">
          © {new Date().getFullYear()} PartnerBridge ·{" "}
          <Link className="hover:text-slate-600" href="/privacy">
            Privacy
          </Link>{" "}
          ·{" "}
          <Link className="hover:text-slate-600" href="/terms">
            Terms
          </Link>
        </p>
      </main>
      <aside className="relative hidden overflow-hidden bg-navy-900 lg:block">
        <div className="absolute inset-0 bg-grid opacity-[0.15]" />
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-accent/40 blur-3xl" />
        <div className="absolute -bottom-32 left-10 size-96 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="relative flex h-full flex-col justify-center p-14 text-white">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-300">Discover → Connect → Grow</p>
          <h2 className="mt-4 max-w-md text-4xl font-bold leading-tight text-balance">Build partnerships that move your business forward.</h2>
          <ul className="mt-10 space-y-4 text-blue-100">
            {[
              "Find distributors, resellers, technology and marketing partners",
              "Send structured partnership requests and negotiate in one place",
              "Run every partnership in a private, shared workspace",
              "Track tasks, milestones, agreements and deals together",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-blue-300" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, ChevronDown, FlaskConical, RotateCcw, Shield, ShieldCheck, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlays";
import { guestSignInAction, resetDemoDataAction } from "@/actions/demo";
import { clearUserCaches } from "@/components/pwa/pwa-provider";
import { GUEST_PERSONAS, type GuestPersona } from "@/lib/local-supabase/config";
import { cn } from "@/lib/utils";
import { publicEnv } from "@/lib/env";

/**
 * Static read-only preview (GitHub Pages): pages were pre-rendered as these two guests,
 * so "signing in" is just a link to their area.
 */
const PREVIEW_PERSONAS: { key: GuestPersona; href: string }[] = [
  { key: "owner", href: "/dashboard" },
  { key: "admin", href: "/admin" },
];
const persona = (key: GuestPersona) => GUEST_PERSONAS.find((p) => p.key === key)!;

function PreviewGuestPanel() {
  return (
    <section aria-labelledby="guest-mode-title" className="rounded-xl border border-dashed border-accent/40 bg-accent/5 p-4">
      <div className="flex items-center gap-2">
        <FlaskConical className="size-4 text-accent" />
        <h2 id="guest-mode-title" className="text-sm font-semibold">
          Guest mode
        </h2>
        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">Read-only preview</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Look around with fictional demo data. No account needed; changes are not saved in this preview.</p>
      <div className="mt-3 grid gap-2">
        {PREVIEW_PERSONAS.map(({ key, href }) => {
          const p = persona(key);
          const Icon = ICONS[key];
          return (
            <Link key={key} href={href} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:border-accent/50 hover:bg-accent/5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary">
                <Icon className="size-4 text-slate-600" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{`Continue as ${p.label.toLowerCase()}`}</span>
                <span className="block truncate text-xs text-muted-foreground">{p.description}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function PreviewBar({ signedInEmail }: { signedInEmail?: string | null }) {
  const current = GUEST_PERSONAS.find((p) => p.email === signedInEmail);
  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-900">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-xs sm:px-6">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <FlaskConical className="size-3.5" /> Read-only preview
        </span>
        <span className="hidden text-amber-800/80 md:inline">Fictional demo data. Changes are not saved here.</span>
        <span className="ml-auto flex flex-wrap items-center gap-1">
          {current && <span className="px-1 text-amber-800/80">Viewing as {current.label.toLowerCase()}</span>}
          {PREVIEW_PERSONAS.filter((p) => p.key !== current?.key).map(({ key, href }) => {
            const Icon = ICONS[key];
            return (
              <Link key={key} href={href} className="inline-flex h-7 items-center gap-1 rounded-md px-2 font-medium hover:bg-amber-100">
                <Icon className="size-3.5" /> {current ? "Switch to" : "View as"} {persona(key).label.toLowerCase()}
              </Link>
            );
          })}
          {current && (
            <Link href="/" className="inline-flex h-7 items-center rounded-md px-2 font-medium hover:bg-amber-100">
              Public site
            </Link>
          )}
        </span>
      </div>
    </div>
  );
}

const ICONS: Record<GuestPersona, React.ComponentType<{ className?: string }>> = {
  owner: Building2,
  manager: Users,
  admin: ShieldCheck,
  moderator: Shield,
};

function useGuestSignIn() {
  const router = useRouter();
  const [pending, setPending] = React.useState<GuestPersona | null>(null);
  const signIn = React.useCallback(
    async (persona: GuestPersona) => {
      setPending(persona);
      try {
        await clearUserCaches();
        const res = await guestSignInAction(persona);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(res.message ?? "Signed in as guest");
        router.push(res.data?.redirectTo ?? "/dashboard");
        router.refresh();
      } finally {
        setPending(null);
      }
    },
    [router],
  );
  return { signIn, pending };
}

/** Persona cards on the sign-in page (local demo mode only). */
export function GuestModePanel() {
  if (publicEnv.staticPreview) return <PreviewGuestPanel />;
  return <LiveGuestPanel />;
}

function LiveGuestPanel() {
  const { signIn, pending } = useGuestSignIn();
  return (
    <section aria-labelledby="guest-mode-title" className="rounded-xl border border-dashed border-accent/40 bg-accent/5 p-4">
      <div className="flex items-center gap-2">
        <FlaskConical className="size-4 text-accent" />
        <h2 id="guest-mode-title" className="text-sm font-semibold">
          Guest mode
        </h2>
        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">Demo data</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">No account needed. Explore with fictional companies, stored only on this computer.</p>
      <div className="mt-3 grid gap-2">
        {GUEST_PERSONAS.map((p) => {
          const Icon = ICONS[p.key];
          return (
            <button
              key={p.key}
              type="button"
              disabled={!!pending}
              onClick={() => signIn(p.key)}
              className={cn(
                "flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:border-accent/50 hover:bg-accent/5 disabled:opacity-60",
                pending === p.key && "border-accent",
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary">
                <Icon className="size-4 text-slate-600" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{pending === p.key ? "Signing in…" : `Continue as ${p.label.toLowerCase()}`}</span>
                <span className="block truncate text-xs text-muted-foreground">{p.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Slim bar shown on every page in local demo mode: guest persona switcher + data reset. */
export function DemoModeBar({ signedInEmail }: { signedInEmail?: string | null }) {
  if (publicEnv.staticPreview) return <PreviewBar signedInEmail={signedInEmail} />;
  return <LiveDemoBar signedInEmail={signedInEmail} />;
}

function LiveDemoBar({ signedInEmail }: { signedInEmail?: string | null }) {
  const router = useRouter();
  const { signIn, pending } = useGuestSignIn();
  const current = GUEST_PERSONAS.find((p) => p.email === signedInEmail);

  const reset = async () => {
    await clearUserCaches();
    const res = await resetDemoDataAction();
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(res.message ?? "Demo data reset");
    router.push("/");
    router.refresh();
  };

  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-900">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-xs sm:px-6">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <FlaskConical className="size-3.5" /> Local demo
        </span>
        <span className="hidden text-amber-800/80 sm:inline">Fictional data, stored only on this computer. Emails print to the server console.</span>
        <span className="ml-auto flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-amber-900 hover:bg-amber-100" disabled={!!pending}>
                <UserRound className="size-3.5" />
                {pending ? "Switching…" : current ? `Guest: ${current.label}` : signedInEmail ? "Switch to guest" : "Try as guest"}
                <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-72">
              <DropdownMenuLabel>Continue as…</DropdownMenuLabel>
              {GUEST_PERSONAS.map((p) => {
                const Icon = ICONS[p.key];
                return (
                  <DropdownMenuItem key={p.key} onSelect={() => signIn(p.key)} disabled={current?.key === p.key}>
                    <Icon />
                    <span className="min-w-0">
                      <span className="block">{p.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{p.description}</span>
                    </span>
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Every demo account uses the password in SEED_DEMO_PASSWORD (README).
              </DropdownMenuLabel>
            </DropdownMenuContent>
          </DropdownMenu>
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-amber-900 hover:bg-amber-100">
                <RotateCcw className="size-3.5" /> Reset data
              </Button>
            }
            title="Reset demo data?"
            description="This erases everything created locally (companies, messages, uploads) and reloads the original demo data. You'll be signed out."
            confirmLabel="Reset"
            onConfirm={reset}
          />
        </span>
      </div>
    </div>
  );
}

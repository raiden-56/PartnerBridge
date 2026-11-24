import type { Metadata } from "next";
import { CloudOff } from "lucide-react";
import { Logo } from "@/components/shared/common";
import { RetryButton } from "./retry";

export const metadata: Metadata = { title: "You're offline" };
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-hero px-6 text-center">
      <Logo />
      <div className="flex size-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
        <CloudOff className="size-8" />
      </div>
      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-bold">You&apos;re offline</h1>
        <p className="text-sm text-muted-foreground">
          This page needs an internet connection. Public pages you visited recently (home, pricing, how it works) are available offline. Your partnership workspaces, messages, documents and requests are never stored for offline access to keep your company data private.
        </p>
        <p className="text-sm text-muted-foreground">Messages you send while offline are queued and delivered automatically when you reconnect (on supported browsers).</p>
      </div>
      <RetryButton />
    </main>
  );
}

"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-red-50 text-destructive">
        <AlertTriangle className="size-6" />
      </div>
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground">
        {typeof navigator !== "undefined" && !navigator.onLine ? "You appear to be offline. This page needs an internet connection." : "We couldn't load this page. Please try again."}
      </p>
      {error.digest && <p className="text-xs text-slate-400">Reference: {error.digest}</p>}
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}

import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared/common";

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-hero px-4 text-center">
      <Logo />
      <div className="flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-accent">
        <Compass className="size-7" />
      </div>
      <div>
        <h1 className="text-3xl font-bold">Page not found</h1>
        <p className="mt-2 text-muted-foreground">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      </div>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/">Go home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Open dashboard</Link>
        </Button>
      </div>
    </main>
  );
}

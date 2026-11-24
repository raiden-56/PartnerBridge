import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/auth-forms";
import { GuestModePanel } from "@/components/demo/guest-mode";
import { publicEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to manage your partnerships.</p>
      </div>
      {publicEnv.localDemo && <GuestModePanel />}
      <LoginForm next={next} error={error} />
    </div>
  );
}

import type { Metadata } from "next";
import crypto from "node:crypto";
import Link from "next/link";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/primitives";
import { CompanyLogo, Logo } from "@/components/shared/common";
import { AcceptInviteButton } from "@/components/team/accept-invite";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth/session";
import { ROLE_LABELS, type OrgRole } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Team invitation", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: inv } = await admin
    .from("organization_invitations")
    .select("email, role, expires_at, accepted_at, revoked_at, organization:organizations(name, logo_url)")
    .eq("token_hash", crypto.createHash("sha256").update(token).digest("hex"))
    .maybeSingle();
  const profile = await getProfile();
  const org = inv?.organization as unknown as { name: string; logo_url: string | null } | undefined;
  const invalid = !inv || inv.revoked_at || inv.accepted_at || new Date(inv.expires_at) < new Date();
  const next = encodeURIComponent(`/invite/${token}`);

  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-hero px-4">
      <Link href="/">
        <Logo />
      </Link>
      <Card className="w-full max-w-md">
        <CardContent className="space-y-5 pt-8 text-center">
          {invalid ? (
            <>
              <Users className="mx-auto size-10 text-slate-300" />
              <h1 className="text-xl font-bold">Invitation unavailable</h1>
              <p className="text-sm text-muted-foreground">This invitation has expired, was revoked or has already been used. Ask your team admin to send a new one.</p>
            </>
          ) : (
            <>
              <CompanyLogo name={org!.name} src={org!.logo_url} className="mx-auto size-16 text-xl" />
              <div>
                <h1 className="text-xl font-bold">Join {org!.name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  You&apos;ve been invited as <strong>{ROLE_LABELS[inv!.role as OrgRole]}</strong>. Invitation for <strong>{inv!.email}</strong>.
                </p>
              </div>
              {profile ? (
                profile.email.toLowerCase() === inv!.email.toLowerCase() ? (
                  <AcceptInviteButton token={token} />
                ) : (
                  <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">You&apos;re signed in as {profile.email}. Sign out and sign in with {inv!.email} to accept.</p>
                )
              ) : (
                <div className="grid gap-2">
                  <Button asChild>
                    <Link href={`/register?next=${next}`}>Create an account</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/login?next=${next}`}>I already have an account</Link>
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { PageHeader } from "@/components/shared/common";
import { PersonalForm } from "@/components/company/forms";
import { DataControls, NotificationPreferences, PasswordForm, PushToggle } from "@/components/settings/settings-forms";
import { requireOrgPage } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ChannelPrefs } from "@/lib/notifications/types";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireOrgPage();
  const supabase = await createClient();
  const { data: prefs } = await supabase.from("notification_preferences").select("preferences").eq("user_id", ctx.userId).maybeSingle();
  const p = ctx.profile;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Account settings" description="Your personal profile, notifications, security and privacy." />
      <Card>
        <CardHeader>
          <CardTitle>Personal profile</CardTitle>
        </CardHeader>
        <CardContent>
          <PersonalForm profile={{ fullName: p.full_name ?? "", designation: p.designation ?? "", phone: p.phone ?? "", avatarUrl: p.avatar_url, email: p.email }} submitLabel="Save profile" />
        </CardContent>
      </Card>
      <Card id="notifications">
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Choose how you hear about activity. Email delivery requires the platform email provider to be configured.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <PushToggle />
          <NotificationPreferences initial={(prefs?.preferences as Record<string, Partial<ChannelPrefs>>) ?? {}} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Signed in as {p.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Privacy & data</CardTitle>
          <CardDescription>Your rights under India&apos;s Digital Personal Data Protection framework: access, correction and erasure.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataControls />
        </CardContent>
      </Card>
    </div>
  );
}

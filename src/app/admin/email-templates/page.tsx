import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { PageHeader } from "@/components/shared/common";
import { TemplateEditor } from "@/components/admin/admin-controls";
import { requireAdminPage } from "@/lib/auth/admin-page";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";

export default async function AdminEmailTemplates() {
  await requireAdminPage("email-templates");
  const { data } = await createAdminClient().from("email_templates").select("*").order("key");
  const configured = Boolean(serverEnv().resendApiKey);
  return (
    <>
      <PageHeader title="Email templates" description={configured ? "Emails are delivered via Resend." : "RESEND_API_KEY is not set — emails are logged to the server console instead of being sent."} />
      <div className="grid gap-6 lg:grid-cols-2">
        {(data ?? []).map((t) => (
          <Card key={t.key}>
            <CardHeader>
              <CardTitle className="font-mono text-sm">{t.key}</CardTitle>
              <CardDescription>{t.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <TemplateEditor tkey={t.key} subject={t.subject} body={t.body} />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

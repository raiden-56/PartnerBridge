import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { PageHeader } from "@/components/shared/common";
import { SettingEditor } from "@/components/admin/admin-controls";
import { requireAdminPage } from "@/lib/auth/admin-page";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/utils";

const KINDS: Record<string, "json" | "number" | "boolean"> = {
  matching_weights: "json",
  rate_limits: "json",
  request_expiry_days: "number",
  maintenance_mode: "boolean",
  allow_new_registrations: "boolean",
};

export default async function AdminSettings() {
  await requireAdminPage("settings");
  const { data } = await createAdminClient().from("platform_settings").select("*").order("key");
  return (
    <>
      <PageHeader title="Platform settings" description="Matching weights, rate limits and platform switches. Every change is audit-logged." />
      <div className="grid gap-6 lg:grid-cols-2">
        {(data ?? []).map((s) => (
          <Card key={s.key}>
            <CardHeader>
              <CardTitle className="font-mono text-sm">{s.key}</CardTitle>
              <CardDescription>{s.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <SettingEditor settingKey={s.key} value={s.value} kind={KINDS[s.key] ?? "json"} />
              <p className="text-xs text-slate-400">Updated {formatDate(s.updated_at, "d MMM yyyy HH:mm")}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

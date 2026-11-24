import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { PageHeader, StatusBadge } from "@/components/shared/common";
import { AnnouncementForm, AnnouncementToggle } from "@/components/admin/admin-controls";
import { requireAdminPage } from "@/lib/auth/admin-page";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/utils";

export default async function AdminAnnouncements() {
  await requireAdminPage("announcements");
  const { data } = await createAdminClient().from("announcements").select("*").order("created_at", { ascending: false }).limit(50);
  return (
    <>
      <PageHeader title="Platform announcements" description="Banners shown on the public site and/or inside the app. The most recent active announcement is displayed." />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>New announcement</CardTitle>
        </CardHeader>
        <CardContent>
          <AnnouncementForm />
        </CardContent>
      </Card>
      <div className="space-y-3">
        {(data ?? []).map((a) => (
          <Card key={a.id}>
            <CardContent className="flex items-start gap-4 pt-5">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {a.title} <StatusBadge status={a.level === "warning" ? "pending" : a.level === "success" ? "active" : "sent"} />
                </p>
                <p className="text-sm text-slate-600">{a.body}</p>
                <p className="text-xs text-slate-400">
                  {a.audience} · from {formatDate(a.starts_at)} {a.ends_at && `to ${formatDate(a.ends_at)}`}
                </p>
              </div>
              <AnnouncementToggle a={a} />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

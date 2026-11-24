import Link from "next/link";
import { CalendarClock, CheckSquare, FileText, Flag, Star, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Progress } from "@/components/ui/primitives";
import { Avatar } from "@/components/ui/overlays";
import { StatCard, StatusBadge } from "@/components/shared/common";
import { ObjectivesEditor } from "@/components/workspace/objectives-editor";
import { getWorkspace } from "@/lib/queries/workspace";
import { createClient } from "@/lib/supabase/server";
import { formatBytes, formatCurrency, formatDate, timeAgo } from "@/lib/utils";

export default async function WorkspaceOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const supabase = await createClient();
  const [{ data: tasks }, { data: milestones }, { data: docs }, { data: deals }, { data: activity }, { data: contacts }] = await Promise.all([
    supabase.from("partnership_tasks").select("id, title, status, due_date, priority, responsible_organization_id").eq("partnership_id", id).is("deleted_at", null),
    supabase.from("partnership_milestones").select("id, title, target_date, progress, status").eq("partnership_id", id).is("deleted_at", null).order("target_date"),
    supabase.from("partnership_documents").select("id, title, category, size_bytes, created_at").eq("partnership_id", id).is("deleted_at", null).order("created_at", { ascending: false }).limit(4),
    supabase.from("partnership_deals").select("stage, expected_value, attributed_revenue, verified_revenue").eq("partnership_id", id).is("deleted_at", null),
    supabase.from("activity_logs").select("id, summary, created_at").eq("partnership_id", id).order("created_at", { ascending: false }).limit(6),
    supabase.from("partnership_members").select("user_id, organization_id, is_primary_contact").eq("partnership_id", id).eq("is_primary_contact", true),
  ]);

  const openTasks = (tasks ?? []).filter((t) => t.status !== "done");
  const progress = milestones?.length ? Math.round(milestones.reduce((s, m) => s + m.progress, 0) / milestones.length) : 0;
  const upcoming = (milestones ?? []).filter((m) => m.status !== "completed").slice(0, 4);
  const pipeline = (deals ?? []).filter((d) => !["won", "lost"].includes(d.stage)).reduce((s, d) => s + Number(d.expected_value), 0);
  const won = (deals ?? []).filter((d) => d.stage === "won");
  const verified = won.reduce((s, d) => s + Number(d.verified_revenue ?? 0), 0);
  const attributed = won.reduce((s, d) => s + Number(d.attributed_revenue ?? 0), 0);
  const person = (uid: string) => ws.people.find((p) => p.id === uid);
  const orgName = (oid: string | null) => (oid === ws.me.id ? ws.me.name : oid === ws.other.id ? ws.other.name : "Unassigned");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Overall progress" value={`${progress}%`} icon={Flag} hint={<Progress value={progress} className="mt-1" />} />
        <StatCard label="Open tasks" value={openTasks.length} icon={CheckSquare} tone="violet" hint={`${(tasks ?? []).length - openTasks.length} completed`} />
        <StatCard label="Pipeline (estimated)" value={formatCurrency(pipeline, "INR", true)} icon={TrendingUp} tone="amber" hint={`${(deals ?? []).length} deals`} />
        <StatCard label="Verified revenue" value={formatCurrency(verified, "INR", true)} icon={Star} tone="green" hint={`Attributed: ${formatCurrency(attributed, "INR", true)}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Partnership information & shared objectives</CardTitle>
            </CardHeader>
            <CardContent>
              <ObjectivesEditor pid={id} title={ws.partnership.title} objectives={ws.partnership.objectives ?? ""} />
            </CardContent>
          </Card>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CheckSquare className="size-4 text-accent" /> Pending tasks
                </CardTitle>
                <Link href={`/dashboard/partnerships/${id}/tasks`} className="text-xs font-medium text-accent hover:underline">
                  All tasks
                </Link>
              </CardHeader>
              <CardContent>
                {openTasks.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No open tasks.</p>
                ) : (
                  <ul className="space-y-2">
                    {openTasks.slice(0, 5).map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-900">{t.title}</span>
                          <span className="text-xs text-slate-500">
                            {orgName(t.responsible_organization_id)} · {t.due_date ? formatDate(t.due_date) : "No date"}
                          </span>
                        </span>
                        <StatusBadge status={t.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock className="size-4 text-accent" /> Upcoming milestones
                </CardTitle>
                <Link href={`/dashboard/partnerships/${id}/milestones`} className="text-xs font-medium text-accent hover:underline">
                  All
                </Link>
              </CardHeader>
              <CardContent>
                {upcoming.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No upcoming milestones.</p>
                ) : (
                  <ul className="space-y-3">
                    {upcoming.map((m) => (
                      <li key={m.id} className="space-y-1.5">
                        <div className="flex justify-between gap-2 text-sm">
                          <span className="font-medium text-slate-900">{m.title}</span>
                          <span className="text-xs text-slate-500">{formatDate(m.target_date)}</span>
                        </div>
                        <Progress value={m.progress} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4 text-accent" /> Important documents
              </CardTitle>
              <Link href={`/dashboard/partnerships/${id}/documents`} className="text-xs font-medium text-accent hover:underline">
                All documents
              </Link>
            </CardHeader>
            <CardContent>
              {(docs ?? []).length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No documents shared yet.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {(docs ?? []).map((d) => (
                    <li key={d.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                      <FileText className="size-5 text-slate-400" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-900">{d.title}</span>
                        <span className="text-xs capitalize text-slate-500">
                          {d.category} · {formatBytes(Number(d.size_bytes))}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Key contacts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[ws.me, ws.other].map((org) => {
                const c = (contacts ?? []).find((x) => x.organization_id === org.id);
                const p = c ? person(c.user_id) : undefined;
                return (
                  <div key={org.id}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{org.name}</p>
                    {p ? (
                      <div className="flex items-center gap-3">
                        <Avatar src={p.avatar} name={p.name} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                          <p className="truncate text-xs text-slate-500">{p.designation ?? p.email}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No primary contact assigned.</p>
                    )}
                  </div>
                );
              })}
              <Link href={`/dashboard/partnerships/${id}/team`} className="block text-xs font-medium text-accent hover:underline">
                Manage workspace team →
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l border-border pl-4">
                {(activity ?? []).map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-white bg-accent" />
                    <p className="text-sm text-slate-700">{a.summary}</p>
                    <p className="text-xs text-slate-400">{timeAgo(a.created_at)}</p>
                  </li>
                ))}
              </ol>
              <Link href={`/dashboard/partnerships/${id}/activity`} className="mt-4 block text-xs font-medium text-accent hover:underline">
                Full timeline →
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

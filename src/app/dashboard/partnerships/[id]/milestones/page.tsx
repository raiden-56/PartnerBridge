import { Milestones, type Milestone } from "@/components/workspace/milestones";
import { getWorkspace } from "@/lib/queries/workspace";
import { createClient } from "@/lib/supabase/server";

export default async function WorkspaceMilestones({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const supabase = await createClient();
  const [{ data }, { data: logs }] = await Promise.all([
    supabase.from("partnership_milestones").select("id, title, description, target_date, progress, status, completed_at").eq("partnership_id", id).is("deleted_at", null).order("target_date", { ascending: true, nullsFirst: false }),
    supabase.from("activity_logs").select("entity_id, summary, created_at").eq("partnership_id", id).eq("entity_type", "milestone").order("created_at", { ascending: false }),
  ]);
  const milestones = (data ?? []).map((m) => ({ ...m, history: (logs ?? []).filter((l) => l.entity_id === m.id).map((l) => ({ summary: l.summary as string, created_at: l.created_at as string })) })) as Milestone[];
  return <Milestones pid={id} milestones={milestones} partnershipTitle={ws.partnership.title} readOnly={ws.partnership.status === "ended"} />;
}

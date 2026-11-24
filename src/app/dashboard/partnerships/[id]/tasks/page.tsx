import { TaskBoard, type Task } from "@/components/workspace/task-board";
import { getWorkspace } from "@/lib/queries/workspace";
import { createClient } from "@/lib/supabase/server";

export default async function WorkspaceTasks({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const supabase = await createClient();
  const { data } = await supabase
    .from("partnership_tasks")
    .select("id, title, description, responsible_organization_id, assignee_id, due_date, priority, status, comments:task_comments(id, body, author_id, created_at)")
    .eq("partnership_id", id)
    .is("deleted_at", null)
    .order("due_date", { ascending: true, nullsFirst: false });
  const tasks = ((data ?? []) as unknown as Task[]).map((t) => ({ ...t, comments: [...t.comments].sort((a, b) => a.created_at.localeCompare(b.created_at)) }));
  return (
    <TaskBoard
      pid={id}
      tasks={tasks}
      people={ws.people.map((p) => ({ id: p.id, orgId: p.orgId, name: p.name, avatar: p.avatar }))}
      orgs={[{ id: ws.me.id, name: ws.me.name }, { id: ws.other.id, name: ws.other.name }]}
      readOnly={ws.partnership.status === "ended"}
    />
  );
}

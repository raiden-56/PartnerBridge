"use client";

import * as React from "react";
import { CalendarDays, MessageSquare, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { Avatar, ConfirmDialog, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { useAction } from "@/components/shared/use-action";
import { addTaskCommentAction, deleteTaskAction, saveTaskAction, setTaskStatusAction } from "@/actions/workspace";
import { cn, formatDate, timeAgo } from "@/lib/utils";

type Status = "todo" | "in_progress" | "blocked" | "done";
export interface Task {
  id: string;
  title: string;
  description: string | null;
  responsible_organization_id: string | null;
  assignee_id: string | null;
  due_date: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  status: Status;
  comments: { id: string; body: string; author_id: string | null; created_at: string }[];
}
interface Person {
  id: string;
  orgId: string;
  name: string;
  avatar: string | null;
}

const COLUMNS: { key: Status; label: string; tone: string }[] = [
  { key: "todo", label: "To do", tone: "bg-slate-400" },
  { key: "in_progress", label: "In progress", tone: "bg-accent" },
  { key: "blocked", label: "Blocked", tone: "bg-destructive" },
  { key: "done", label: "Done", tone: "bg-success" },
];
const PRIORITY: Record<Task["priority"], "muted" | "accent" | "warning" | "destructive"> = { low: "muted", medium: "accent", high: "warning", urgent: "destructive" };

export function TaskBoard({ pid, tasks, people, orgs, readOnly }: { pid: string; tasks: Task[]; people: Person[]; orgs: { id: string; name: string }[]; readOnly?: boolean }) {
  const [editing, setEditing] = React.useState<Task | "new" | null>(null);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const move = useAction(setTaskStatusAction);
  const person = (id: string | null) => people.find((p) => p.id === id);
  const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.name;

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{tasks.length} tasks · drag cards between columns or open a task to edit</p>
        {!readOnly && (
          <Button variant="accent" onClick={() => setEditing("new")}>
            <Plus /> New task
          </Button>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.key);
          return (
            <div
              key={col.key}
              className="flex min-h-48 flex-col rounded-xl border border-border bg-slate-50/70 p-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId && !readOnly) move.run(pid, dragId, col.key);
                setDragId(null);
              }}
            >
              <div className="mb-3 flex items-center gap-2 px-1">
                <span className={cn("size-2 rounded-full", col.tone)} />
                <p className="text-sm font-semibold text-slate-700">{col.label}</p>
                <span className="ml-auto rounded-full bg-white px-2 text-xs text-slate-500">{items.length}</span>
              </div>
              <div className="flex-1 space-y-2">
                {items.map((t) => {
                  const a = person(t.assignee_id);
                  const overdue = t.due_date && t.status !== "done" && new Date(t.due_date) < new Date(new Date().toDateString());
                  return (
                    <button
                      key={t.id}
                      draggable={!readOnly}
                      onDragStart={() => setDragId(t.id)}
                      onClick={() => setEditing(t)}
                      className="w-full rounded-lg border border-border bg-white p-3 text-left shadow-xs transition-shadow hover:shadow-[var(--shadow-lift)]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn("text-sm font-medium text-slate-900", t.status === "done" && "text-slate-400 line-through")}>{t.title}</p>
                        <Badge variant={PRIORITY[t.priority]} className="shrink-0 capitalize">
                          {t.priority}
                        </Badge>
                      </div>
                      {orgName(t.responsible_organization_id) && <p className="mt-1 text-xs text-slate-500">{orgName(t.responsible_organization_id)}</p>}
                      <div className="mt-2.5 flex items-center gap-2 text-xs text-slate-500">
                        {t.due_date && (
                          <span className={cn("flex items-center gap-1", overdue && "font-medium text-destructive")}>
                            <CalendarDays className="size-3" /> {formatDate(t.due_date, "d MMM")}
                          </span>
                        )}
                        {t.comments.length > 0 && (
                          <span className="flex items-center gap-1">
                            <MessageSquare className="size-3" /> {t.comments.length}
                          </span>
                        )}
                        {a && <Avatar src={a.avatar} name={a.name} className="ml-auto size-6 text-[9px]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <TaskDialog pid={pid} task={editing} onClose={() => setEditing(null)} people={people} orgs={orgs} readOnly={readOnly} />
    </>
  );
}

function TaskDialog({ pid, task, onClose, people, orgs, readOnly }: { pid: string; task: Task | "new" | null; onClose: () => void; people: Person[]; orgs: { id: string; name: string }[]; readOnly?: boolean }) {
  const save = useAction(saveTaskAction);
  const del = useAction(deleteTaskAction);
  const comment = useAction(addTaskCommentAction);
  const [respOrg, setRespOrg] = React.useState<string>("");
  const [text, setText] = React.useState("");
  const t = task === "new" ? null : task;
  React.useEffect(() => setRespOrg(t?.responsible_organization_id ?? ""), [t]);

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t ? "Edit task" : "New shared task"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const res = await save.run(pid, t?.id ?? null, {
              title: fd.get("title"),
              description: fd.get("description"),
              responsibleOrganizationId: fd.get("responsibleOrganizationId"),
              assigneeId: fd.get("assigneeId"),
              dueDate: fd.get("dueDate"),
              priority: fd.get("priority"),
              status: fd.get("status"),
            });
            if (res.ok) onClose();
          }}
        >
          <fieldset disabled={readOnly} className="space-y-4">
            <Field label="Title" error={save.fieldErrors.title} required>
              <Input name="title" defaultValue={t?.title} autoFocus />
            </Field>
            <Field label="Description">
              <Textarea name="description" rows={3} defaultValue={t?.description ?? ""} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Responsible company">
                <NativeSelect name="responsibleOrganizationId" value={respOrg} onChange={(e) => setRespOrg(e.target.value)}>
                  <option value="">Shared / unassigned</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Assignee">
                <NativeSelect name="assigneeId" defaultValue={t?.assignee_id ?? ""} key={respOrg}>
                  <option value="">Unassigned</option>
                  {people
                    .filter((p) => !respOrg || p.orgId === respOrg)
                    .map((p) => (
                      <option key={p.id + p.orgId} value={p.id}>
                        {p.name} ({orgs.find((o) => o.id === p.orgId)?.name})
                      </option>
                    ))}
                </NativeSelect>
              </Field>
              <Field label="Due date" error={save.fieldErrors.dueDate}>
                <Input type="date" name="dueDate" defaultValue={t?.due_date ?? ""} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Priority">
                  <NativeSelect name="priority" defaultValue={t?.priority ?? "medium"}>
                    {["low", "medium", "high", "urgent"].map((p) => (
                      <option key={p} value={p}>
                        {p[0]!.toUpperCase() + p.slice(1)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Status">
                  <NativeSelect name="status" defaultValue={t?.status ?? "todo"}>
                    {COLUMNS.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
            </div>
          </fieldset>
          {!readOnly && (
            <DialogFooter className="sm:justify-between">
              {t ? (
                <ConfirmDialog
                  trigger={
                    <Button type="button" variant="ghost" className="text-destructive">
                      <Trash2 /> Delete
                    </Button>
                  }
                  title="Delete this task?"
                  confirmLabel="Delete"
                  onConfirm={async () => {
                    const res = await del.run(pid, t.id);
                    if (res.ok) onClose();
                  }}
                />
              ) : (
                <span />
              )}
              <Button type="submit" loading={save.pending}>
                {t ? "Save changes" : "Create task"}
              </Button>
            </DialogFooter>
          )}
        </form>

        {t && (
          <div className="mt-6 border-t border-border pt-5">
            <p className="mb-3 text-sm font-semibold text-slate-900">Comments ({t.comments.length})</p>
            <ul className="mb-3 max-h-56 space-y-3 overflow-y-auto">
              {t.comments.map((c) => {
                const p = people.find((x) => x.id === c.author_id);
                return (
                  <li key={c.id} className="flex gap-2.5">
                    <Avatar src={p?.avatar} name={p?.name} className="size-7 text-[10px]" />
                    <div className="min-w-0 flex-1 rounded-lg bg-slate-50 px-3 py-2">
                      <p className="text-xs text-slate-500">
                        <span className="font-medium text-slate-700">{p?.name ?? "Member"}</span> · {timeAgo(c.created_at)}
                      </p>
                      <p className="whitespace-pre-wrap text-sm text-slate-800">{c.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {!readOnly && (
              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!text.trim()) return;
                  const res = await comment.run(pid, t.id, text);
                  if (res.ok) {
                    setText("");
                    onClose();
                  }
                }}
              >
                <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" />
                <Button type="submit" variant="outline" loading={comment.pending}>
                  Post
                </Button>
              </form>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

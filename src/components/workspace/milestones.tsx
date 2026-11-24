"use client";

import * as React from "react";
import { CalendarPlus, CheckCircle2, Flag, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Field, Input, NativeSelect, Progress, Textarea } from "@/components/ui/primitives";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { EmptyState, StatusBadge } from "@/components/shared/common";
import { useAction } from "@/components/shared/use-action";
import { deleteMilestoneAction, saveMilestoneAction } from "@/actions/workspace";
import { formatDate } from "@/lib/utils";

export interface Milestone {
  id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  progress: number;
  status: "planned" | "in_progress" | "completed" | "missed";
  completed_at: string | null;
  history: { summary: string; created_at: string }[];
}

/** Google Calendar "add event" template link — works without any API credentials. */
function calendarLink(m: Milestone, partnershipTitle: string) {
  if (!m.target_date) return null;
  const d = m.target_date.replace(/-/g, "");
  const next = new Date(m.target_date);
  next.setDate(next.getDate() + 1);
  const end = next.toISOString().slice(0, 10).replace(/-/g, "");
  const params = new URLSearchParams({ action: "TEMPLATE", text: `${m.title} — ${partnershipTitle}`, dates: `${d}/${end}`, details: m.description ?? "PartnerBridge milestone" });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function Milestones({ pid, milestones, partnershipTitle, readOnly }: { pid: string; milestones: Milestone[]; partnershipTitle: string; readOnly?: boolean }) {
  const [editing, setEditing] = React.useState<Milestone | "new" | null>(null);
  const save = useAction(saveMilestoneAction);
  const del = useAction(deleteMilestoneAction);
  const m = editing === "new" ? null : editing;
  const done = milestones.filter((x) => x.status === "completed").length;

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {done} of {milestones.length} milestones completed
        </p>
        {!readOnly && (
          <Button variant="accent" onClick={() => setEditing("new")}>
            <Plus /> New milestone
          </Button>
        )}
      </div>
      {milestones.length === 0 ? (
        <EmptyState icon={Flag} title="No milestones yet" description="Break the partnership into measurable milestones with target dates." />
      ) : (
        <div className="space-y-3">
          {milestones.map((x) => {
            const cal = calendarLink(x, partnershipTitle);
            const overdue = x.target_date && x.status !== "completed" && new Date(x.target_date) < new Date(new Date().toDateString());
            return (
              <Card key={x.id}>
                <CardContent className="flex flex-col gap-4 pt-5 md:flex-row md:items-center">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-accent">{x.status === "completed" ? <CheckCircle2 className="size-5 text-success" /> : <Flag className="size-5" />}</div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{x.title}</p>
                      <StatusBadge status={overdue ? "missed" : x.status} />
                    </div>
                    {x.description && <p className="text-sm text-slate-600">{x.description}</p>}
                    <div className="flex items-center gap-3">
                      <Progress value={x.progress} className="max-w-sm" indicatorClassName={x.status === "completed" ? "bg-success" : undefined} />
                      <span className="text-xs font-semibold tabular-nums text-slate-600">{x.progress}%</span>
                    </div>
                    {x.history.length > 0 && (
                      <details className="text-xs text-slate-500">
                        <summary className="cursor-pointer text-accent">Activity history ({x.history.length})</summary>
                        <ul className="mt-2 space-y-1">
                          {x.history.map((h, i) => (
                            <li key={i}>
                              {formatDate(h.created_at, "d MMM, HH:mm")} — {h.summary}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-sm">
                    <span className="text-xs text-slate-500">{x.status === "completed" ? `Completed ${formatDate(x.completed_at)}` : `Target ${formatDate(x.target_date)}`}</span>
                    {cal && (
                      <Button asChild size="icon-sm" variant="ghost" title="Add to Google Calendar">
                        <a href={cal} target="_blank" rel="noopener noreferrer" aria-label="Add to Google Calendar">
                          <CalendarPlus />
                        </a>
                      </Button>
                    )}
                    {!readOnly && (
                      <Button size="icon-sm" variant="ghost" onClick={() => setEditing(x)} aria-label="Edit milestone">
                        <Pencil />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m ? "Edit milestone" : "New milestone"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const res = await save.run(pid, m?.id ?? null, { title: fd.get("title"), description: fd.get("description"), targetDate: fd.get("targetDate"), progress: fd.get("progress"), status: fd.get("status") });
              if (res.ok) setEditing(null);
            }}
          >
            <Field label="Title" error={save.fieldErrors.title} required>
              <Input name="title" defaultValue={m?.title} autoFocus />
            </Field>
            <Field label="Description">
              <Textarea name="description" rows={3} defaultValue={m?.description ?? ""} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Target date">
                <Input type="date" name="targetDate" defaultValue={m?.target_date ?? ""} />
              </Field>
              <Field label="Progress %" error={save.fieldErrors.progress}>
                <Input type="number" min={0} max={100} name="progress" defaultValue={m?.progress ?? 0} />
              </Field>
              <Field label="Status">
                <NativeSelect name="status" defaultValue={m?.status ?? "planned"}>
                  <option value="planned">Planned</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                  <option value="missed">Missed</option>
                </NativeSelect>
              </Field>
            </div>
            <DialogFooter className="sm:justify-between">
              {m ? (
                <ConfirmDialog
                  trigger={
                    <Button type="button" variant="ghost" className="text-destructive">
                      <Trash2 /> Delete
                    </Button>
                  }
                  title="Delete milestone?"
                  confirmLabel="Delete"
                  onConfirm={async () => {
                    const r = await del.run(pid, m.id);
                    if (r.ok) setEditing(null);
                  }}
                />
              ) : (
                <span />
              )}
              <Button type="submit" loading={save.pending}>
                Save milestone
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/primitives";
import { useAction } from "@/components/shared/use-action";
import { updatePartnershipAction } from "@/actions/workspace";

export function ObjectivesEditor({ pid, title, objectives }: { pid: string; title: string; objectives: string }) {
  const [editing, setEditing] = React.useState(false);
  const { run, pending, fieldErrors } = useAction(updatePartnershipAction);
  if (!editing)
    return (
      <div className="space-y-3">
        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{objectives || "No shared objectives recorded yet. Agree on what success looks like for both companies."}</p>
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          <Pencil /> Edit
        </Button>
      </div>
    );
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const res = await run(pid, { title: fd.get("title"), objectives: fd.get("objectives") });
        if (res.ok) setEditing(false);
      }}
    >
      <Field label="Partnership name" error={fieldErrors.title}>
        <Input name="title" defaultValue={title} />
      </Field>
      <Field label="Shared objectives" error={fieldErrors.objectives}>
        <Textarea name="objectives" rows={5} defaultValue={objectives} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

"use client";

import * as React from "react";
import { Paperclip, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/primitives";
import { useAction } from "@/components/shared/use-action";
import { applyToOpportunityAction } from "@/actions/opportunities";

export function ApplyForm({ opportunityId }: { opportunityId: string }) {
  const { run, pending, fieldErrors } = useAction(applyToOpportunityAction, { successMessage: undefined });
  const [files, setFiles] = React.useState<File[]>([]);
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.delete("attachments");
        files.forEach((f) => fd.append("attachments", f));
        await run(fd);
      }}
    >
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <Field label="Your proposal" htmlFor="proposal" error={fieldErrors.proposal} hint="Explain why you're a great fit and how you'd approach this partnership (min. 50 characters)." required>
        <Textarea id="proposal" name="proposal" rows={6} required />
      </Field>
      <Field label="Relevant capabilities & experience" htmlFor="capabilities" error={fieldErrors.capabilities}>
        <Textarea id="capabilities" name="capabilities" rows={3} placeholder="Coverage, team size, similar partnerships, certifications…" />
      </Field>
      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-600 hover:bg-slate-50">
        <Paperclip className="size-4" />
        {files.length ? files.map((f) => f.name).join(", ") : "Attach supporting documents (optional, up to 3 · 25 MB each)"}
        <input type="file" multiple className="sr-only" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 3))} />
      </label>
      <Button type="submit" variant="accent" className="w-full" loading={pending}>
        <Send /> Submit application
      </Button>
    </form>
  );
}

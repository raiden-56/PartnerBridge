"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { useAction } from "@/components/shared/use-action";
import { sendRequestAction } from "@/actions/requests";
import type { Category } from "@/types/db";

export function RequestForm({
  target,
  companies,
  categories,
  suggestedCategoryIds,
  usage,
}: {
  target: { id: string; name: string } | null;
  companies: { id: string; name: string }[];
  categories: Category[];
  suggestedCategoryIds: string[];
  usage: { used: number; limit: number };
}) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction(sendRequestAction, { refresh: false });
  const [files, setFiles] = React.useState<File[]>([]);
  const [asDraft, setAsDraft] = React.useState(false);
  const suggested = categories.filter((c) => suggestedCategoryIds.includes(c.id));
  const others = categories.filter((c) => !suggestedCategoryIds.includes(c.id));
  const remaining = usage.limit < 0 ? Infinity : usage.limit - usage.used;

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("asDraft", String(asDraft));
        fd.delete("attachments");
        files.forEach((f) => fd.append("attachments", f));
        const res = await run(fd);
        if (res.ok && res.data) router.push(`/dashboard/requests/${res.data.id}`);
      }}
    >
      {target ? (
        <input type="hidden" name="receiverOrganizationId" value={target.id} />
      ) : (
        <Field label="Company" htmlFor="receiverOrganizationId" error={fieldErrors.receiverOrganizationId} required>
          <NativeSelect id="receiverOrganizationId" name="receiverOrganizationId" defaultValue="">
            <option value="" disabled>
              Select a company
            </option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      <Field label="Partnership category" htmlFor="categoryId" error={fieldErrors.categoryId} required hint={suggested.length ? "Suggested categories are based on what this company offers and seeks." : undefined}>
        <NativeSelect id="categoryId" name="categoryId" defaultValue={suggested[0]?.id ?? ""}>
          <option value="" disabled>
            Select a category
          </option>
          {suggested.length > 0 && (
            <optgroup label="Suggested">
              {suggested.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label={suggested.length ? "Other categories" : "Categories"}>
            {others.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        </NativeSelect>
      </Field>
      <Field label="Subject" htmlFor="subject" error={fieldErrors.subject} required>
        <Input id="subject" name="subject" maxLength={160} placeholder="e.g. Distribution partnership for South India" />
      </Field>
      <Field label="Personalized introduction" htmlFor="introduction" error={fieldErrors.introduction} required hint="Who you are and why you're reaching out to them specifically.">
        <Textarea id="introduction" name="introduction" rows={4} />
      </Field>
      <Field label="Proposed collaboration" htmlFor="proposedCollaboration" error={fieldErrors.proposedCollaboration} required>
        <Textarea id="proposedCollaboration" name="proposedCollaboration" rows={4} placeholder="What would you do together? Scope, responsibilities, first steps…" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Expected benefits" htmlFor="expectedBenefits" error={fieldErrors.expectedBenefits}>
          <Textarea id="expectedBenefits" name="expectedBenefits" rows={3} />
        </Field>
        <Field label="Proposed commercial model" htmlFor="commercialModel" error={fieldErrors.commercialModel}>
          <Textarea id="commercialModel" name="commercialModel" rows={3} placeholder="e.g. 15% referral fee, revenue share, margin structure" />
        </Field>
      </div>
      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-600 hover:bg-slate-50">
        <Paperclip className="size-4" />
        {files.length ? files.map((f) => f.name).join(", ") : "Attach supporting documents (optional — brochure, deck, price list; up to 3)"}
        <input type="file" multiple className="sr-only" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 3))} />
      </label>
      <div className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-border pt-5 sm:flex-row sm:items-center">
        <p className="text-xs text-muted-foreground">
          {Number.isFinite(remaining) ? `${Math.max(0, remaining)} of ${usage.limit} requests left this month on your plan.` : "Unlimited requests on your plan."}
        </p>
        <div className="flex gap-2">
          <Button type="submit" variant="outline" onClick={() => setAsDraft(true)} loading={pending && asDraft}>
            Save draft
          </Button>
          <Button type="submit" variant="accent" onClick={() => setAsDraft(false)} loading={pending && !asDraft} disabled={remaining <= 0}>
            <Send /> Send request
          </Button>
        </div>
      </div>
    </form>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Rocket, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { useAction } from "@/components/shared/use-action";
import { saveOpportunityAction } from "@/actions/opportunities";
import { COMPANY_SIZES } from "@/lib/validation/schemas";
import { cn } from "@/lib/utils";
import type { Category, Industry, Opportunity } from "@/types/db";

export function OpportunityForm({
  opportunity,
  categories,
  industries,
}: {
  opportunity: (Opportunity & { requirements: string | null; benefits: string | null }) | null;
  categories: Category[];
  industries: Industry[];
}) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction(saveOpportunityAction, { refresh: false });
  const [publish, setPublish] = React.useState(false);
  const [preferred, setPreferred] = React.useState<string[]>(opportunity?.preferred_industry_ids ?? []);
  const parents = industries.filter((i) => !i.parent_id);
  const isDraft = !opportunity || opportunity.status === "draft";

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const res = await run(opportunity?.id ?? null, {
          title: fd.get("title"),
          categoryId: fd.get("categoryId"),
          description: fd.get("description"),
          requiredCapabilities: fd.get("requiredCapabilities"),
          preferredIndustryIds: preferred,
          targetLocations: fd.get("targetLocations"),
          expectedPartnerSize: fd.get("expectedPartnerSize"),
          commercialModel: fd.get("commercialModel"),
          duration: fd.get("duration"),
          requirements: fd.get("requirements"),
          benefits: fd.get("benefits"),
          deadline: fd.get("deadline"),
          visibility: fd.get("visibility"),
          publish,
        });
        if (res.ok && res.data) {
          router.push(`/dashboard/opportunities/${res.data.id}`);
          router.refresh();
        }
      }}
    >
      <Field label="Opportunity title" htmlFor="title" error={fieldErrors.title} required>
        <Input id="title" name="title" defaultValue={opportunity?.title} placeholder="e.g. Looking for distribution partners in Karnataka" maxLength={160} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Partnership category" htmlFor="categoryId" error={fieldErrors.categoryId} required>
          <NativeSelect id="categoryId" name="categoryId" defaultValue={opportunity?.category_id ?? ""}>
            <option value="" disabled>
              Select category
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Visibility" htmlFor="visibility" error={fieldErrors.visibility}>
          <NativeSelect id="visibility" name="visibility" defaultValue={opportunity?.visibility ?? "public"}>
            <option value="public">Public — anyone can view</option>
            <option value="members">Members — signed-in users only</option>
            <option value="verified_only">Verified companies can apply</option>
          </NativeSelect>
        </Field>
      </div>
      <Field label="Description" htmlFor="description" error={fieldErrors.description} required hint="Context, what you're looking for and why it's a good opportunity (min. 50 characters).">
        <Textarea id="description" name="description" rows={6} defaultValue={opportunity?.description} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Required capabilities" htmlFor="requiredCapabilities" hint="Comma-separated">
          <Input id="requiredCapabilities" name="requiredCapabilities" defaultValue={opportunity?.required_capabilities.join(", ")} />
        </Field>
        <Field label="Target locations" htmlFor="targetLocations" hint="Comma-separated, e.g. Karnataka, Tamil Nadu">
          <Input id="targetLocations" name="targetLocations" defaultValue={opportunity?.target_locations.join(", ")} />
        </Field>
        <Field label="Expected partner size" htmlFor="expectedPartnerSize">
          <NativeSelect id="expectedPartnerSize" name="expectedPartnerSize" defaultValue={opportunity?.expected_partner_size ?? ""}>
            <option value="">Any size</option>
            {COMPANY_SIZES.map((s) => (
              <option key={s} value={s}>
                {s} employees
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Application deadline" htmlFor="deadline" error={fieldErrors.deadline}>
          <Input id="deadline" name="deadline" type="date" defaultValue={opportunity?.deadline ?? ""} />
        </Field>
        <Field label="Commercial model (optional)" htmlFor="commercialModel" error={fieldErrors.commercialModel}>
          <Input id="commercialModel" name="commercialModel" defaultValue={opportunity?.commercial_model ?? ""} placeholder="e.g. 18–22% distributor margin" />
        </Field>
        <Field label="Partnership duration" htmlFor="duration">
          <Input id="duration" name="duration" defaultValue={opportunity?.duration ?? ""} placeholder="e.g. 12 months, renewable" />
        </Field>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Preferred industries</p>
        <div className="flex flex-wrap gap-1.5">
          {parents.map((i) => {
            const on = preferred.includes(i.id);
            return (
              <button
                type="button"
                key={i.id}
                aria-pressed={on}
                onClick={() => setPreferred((p) => (on ? p.filter((x) => x !== i.id) : [...p, i.id].slice(0, 10)))}
                className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", on ? "border-accent bg-accent text-white" : "border-border bg-card text-slate-600 hover:bg-slate-50")}
              >
                {i.name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Requirements" htmlFor="requirements" error={fieldErrors.requirements}>
          <Textarea id="requirements" name="requirements" rows={4} defaultValue={opportunity?.requirements ?? ""} />
        </Field>
        <Field label="Benefits for partners" htmlFor="benefits" error={fieldErrors.benefits}>
          <Textarea id="benefits" name="benefits" rows={4} defaultValue={opportunity?.benefits ?? ""} />
        </Field>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
        <Button type="submit" variant="outline" onClick={() => setPublish(false)} loading={pending && !publish}>
          <Save /> {isDraft ? "Save draft" : "Save changes"}
        </Button>
        {isDraft && (
          <Button type="submit" variant="accent" onClick={() => setPublish(true)} loading={pending && publish}>
            <Rocket /> Publish opportunity
          </Button>
        )}
      </div>
    </form>
  );
}

"use client";

import * as React from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/overlays";
import { useAction } from "@/components/shared/use-action";
import * as A from "@/actions/admin";

type Result = { ok: true; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Generic admin button: optionally prompts for a reason, then runs the bound server action. */
export function AdminAction({
  label,
  action,
  prompt,
  variant = "outline",
  confirmTitle,
}: {
  label: React.ReactNode;
  action: (reason: string) => Promise<Result>;
  prompt?: string;
  variant?: ButtonProps["variant"];
  confirmTitle?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const { run, pending } = useAction(action);
  if (!prompt)
    return (
      <Button size="sm" variant={variant} loading={pending} onClick={() => run("")}>
        {label}
      </Button>
    );
  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{confirmTitle ?? "Confirm action"}</DialogTitle>
            <DialogDescription>This action is recorded in the audit log.</DialogDescription>
          </DialogHeader>
          <Field label={prompt}>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button
              variant={variant === "outline" ? "default" : variant}
              loading={pending}
              onClick={async () => {
                const r = await run(reason);
                if (r.ok) {
                  setOpen(false);
                  setReason("");
                }
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function VerificationDocButton({ verificationId, path, name }: { verificationId: string; path: string; name: string }) {
  return (
    <button
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-2 py-1 text-xs hover:bg-secondary"
      onClick={async () => {
        const r = await A.verificationDocUrlAction(verificationId, path);
        if (r.ok && r.data) window.open(r.data.url, "_blank", "noopener");
        else if (!r.ok) toast.error(r.error);
      }}
    >
      <FileText className="size-3.5" /> {name}
    </button>
  );
}

export function RoleSelect({ userId, role }: { userId: string; role: string }) {
  const { run, pending } = useAction(A.setUserStatusAction);
  return (
    <NativeSelect className="h-8 w-36 text-xs" defaultValue={role} disabled={pending} onChange={(e) => run(userId, "role", e.target.value as "user")}>
      <option value="user">User</option>
      <option value="moderator">Moderator</option>
      <option value="super_admin">Super admin</option>
    </NativeSelect>
  );
}

export function AssignPlan({ orgId, plans }: { orgId: string; plans: { code: string; name: string }[] }) {
  const { run, pending } = useAction(A.assignPlanAction);
  const [plan, setPlan] = React.useState(plans[0]?.code ?? "free");
  const [months, setMonths] = React.useState(1);
  return (
    <div className="flex items-center gap-1.5">
      <NativeSelect className="h-8 w-32 text-xs" value={plan} onChange={(e) => setPlan(e.target.value)}>
        {plans.map((p) => (
          <option key={p.code} value={p.code}>
            {p.name}
          </option>
        ))}
      </NativeSelect>
      <Input type="number" min={1} max={36} value={months} onChange={(e) => setMonths(Number(e.target.value))} className="h-8 w-16 text-xs" aria-label="Months" />
      <Button size="sm" variant="outline" loading={pending} onClick={() => run(orgId, plan, months)}>
        Assign
      </Button>
    </div>
  );
}

export function PlanEditor({ plan }: { plan: { id: string; name: string; tagline: string | null; price_monthly: number; price_yearly: number; trial_days: number; is_active: boolean; features: string[]; limits: Record<string, number> } }) {
  const { run, pending, fieldErrors } = useAction(A.updatePlanAction);
  const [active, setActive] = React.useState(plan.is_active);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        let limits: Record<string, number> = {};
        try {
          limits = JSON.parse(String(fd.get("limits")));
        } catch {
          return toast.error("Limits must be valid JSON");
        }
        await run(plan.id, {
          name: fd.get("name"),
          tagline: fd.get("tagline"),
          price_monthly: fd.get("price_monthly"),
          price_yearly: fd.get("price_yearly"),
          trial_days: fd.get("trial_days"),
          is_active: active,
          features: String(fd.get("features")).split("\n").map((s) => s.trim()).filter(Boolean),
          limits,
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" error={fieldErrors.name}>
          <Input name="name" defaultValue={plan.name} />
        </Field>
        <Field label="Tagline">
          <Input name="tagline" defaultValue={plan.tagline ?? ""} />
        </Field>
        <Field label="Monthly price (₹)">
          <Input name="price_monthly" type="number" min={0} defaultValue={plan.price_monthly} />
        </Field>
        <Field label="Yearly price (₹)">
          <Input name="price_yearly" type="number" min={0} defaultValue={plan.price_yearly} />
        </Field>
        <Field label="Trial days">
          <Input name="trial_days" type="number" min={0} max={90} defaultValue={plan.trial_days} />
        </Field>
        <label className="flex items-center gap-2 pt-6 text-sm">
          <Switch checked={active} onCheckedChange={setActive} /> Active
        </label>
      </div>
      <Field label="Features (one per line)">
        <Textarea name="features" rows={5} defaultValue={plan.features.join("\n")} />
      </Field>
      <Field label="Limits (JSON; -1 = unlimited, 0/1 for feature flags)" error={fieldErrors.limits}>
        <Textarea name="limits" rows={7} className="font-mono text-xs" defaultValue={JSON.stringify(plan.limits, null, 2)} />
      </Field>
      <Button type="submit" loading={pending}>
        Save plan
      </Button>
    </form>
  );
}

export function SettingEditor({ settingKey, value, kind }: { settingKey: string; value: unknown; kind: "json" | "number" | "boolean" }) {
  const { run, pending } = useAction(A.updateSettingAction);
  const [v, setV] = React.useState(kind === "json" ? JSON.stringify(value, null, 2) : String(value));
  const [b, setB] = React.useState(value === true);
  if (kind === "boolean")
    return (
      <Switch
        checked={b}
        disabled={pending}
        onCheckedChange={async (c) => {
          setB(c);
          await run(settingKey, c);
        }}
      />
    );
  return (
    <div className="space-y-2">
      {kind === "json" ? <Textarea rows={8} className="font-mono text-xs" value={v} onChange={(e) => setV(e.target.value)} /> : <Input type="number" value={v} onChange={(e) => setV(e.target.value)} className="w-32" />}
      <Button
        size="sm"
        loading={pending}
        onClick={async () => {
          try {
            await run(settingKey, kind === "json" ? JSON.parse(v) : Number(v));
          } catch {
            toast.error("Invalid JSON");
          }
        }}
      >
        Save
      </Button>
    </div>
  );
}

export function TaxonomyForm({ kind, parents }: { kind: "industry" | "category"; parents?: { id: string; name: string }[] }) {
  const { run, pending, fieldErrors } = useAction(A.upsertTaxonomyAction);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const r = await run(kind, { name: fd.get("name"), parentId: fd.get("parentId") ?? "", description: fd.get("description") ?? undefined, isActive: true });
        if (r.ok) form.reset();
      }}
    >
      <Field label={`New ${kind}`} error={fieldErrors.name}>
        <Input name="name" className="w-56" />
      </Field>
      {kind === "industry" && parents && (
        <Field label="Parent (optional)">
          <NativeSelect name="parentId" className="w-56">
            <option value="">Top level</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      {kind === "category" && (
        <Field label="Description">
          <Input name="description" className="w-72" />
        </Field>
      )}
      <Button type="submit" loading={pending}>
        Add
      </Button>
    </form>
  );
}

export function ToggleActive({ kind, id, name, active }: { kind: "industry" | "category"; id: string; name: string; active: boolean }) {
  const { run, pending } = useAction(A.upsertTaxonomyAction);
  return <Switch checked={active} disabled={pending} onCheckedChange={(c) => run(kind, { id, name, isActive: c })} aria-label={`Toggle ${name}`} />;
}

export function TemplateEditor({ tkey, subject, body }: { tkey: string; subject: string; body: string }) {
  const save = useAction(A.updateEmailTemplateAction);
  const test = useAction(A.sendTestEmailAction);
  const [s, setS] = React.useState(subject);
  const [b, setB] = React.useState(body);
  return (
    <div className="space-y-3">
      <Field label="Subject">
        <Input value={s} onChange={(e) => setS(e.target.value)} />
      </Field>
      <Field label="Body" hint="Placeholders like {{name}}, {{link}}, {{company}} are replaced when sending.">
        <Textarea rows={7} value={b} onChange={(e) => setB(e.target.value)} className="font-mono text-xs" />
      </Field>
      <div className="flex gap-2">
        <Button size="sm" loading={save.pending} onClick={() => save.run(tkey, s, b)}>
          Save
        </Button>
        <Button size="sm" variant="outline" loading={test.pending} onClick={() => test.run(tkey)}>
          Send test to me
        </Button>
      </div>
    </div>
  );
}

export function AnnouncementForm() {
  const { run, pending, fieldErrors } = useAction(A.saveAnnouncementAction);
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const r = await run({ title: fd.get("title"), body: fd.get("body"), level: fd.get("level"), audience: fd.get("audience"), endsAt: fd.get("endsAt") || undefined, isActive: true });
        if (r.ok) form.reset();
      }}
    >
      <Field label="Title" error={fieldErrors.title}>
        <Input name="title" />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Level">
          <NativeSelect name="level">
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="success">Success</option>
          </NativeSelect>
        </Field>
        <Field label="Audience">
          <NativeSelect name="audience">
            <option value="all">Everyone</option>
            <option value="public">Public site</option>
            <option value="members">Signed-in members</option>
          </NativeSelect>
        </Field>
        <Field label="Ends">
          <Input type="date" name="endsAt" />
        </Field>
      </div>
      <Field label="Message" error={fieldErrors.body} className="sm:col-span-2">
        <Textarea name="body" rows={2} />
      </Field>
      <div>
        <Button type="submit" loading={pending}>
          Publish announcement
        </Button>
      </div>
    </form>
  );
}

export function AnnouncementToggle({ a }: { a: { id: string; title: string; body: string; level: string; audience: string; is_active: boolean } }) {
  const { run, pending } = useAction(A.saveAnnouncementAction);
  return <Switch checked={a.is_active} disabled={pending} onCheckedChange={(c) => run({ id: a.id, title: a.title, body: a.body, level: a.level, audience: a.audience, isActive: c })} aria-label="Active" />;
}

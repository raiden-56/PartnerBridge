"use client";

import * as React from "react";
import { Plus, Trash2, Upload, FileText, ShieldCheck, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea, Badge } from "@/components/ui/primitives";
import { Avatar, Switch } from "@/components/ui/overlays";
import { useAction } from "@/components/shared/use-action";
import { VerificationBadge } from "@/components/shared/common";
import {
  saveCompanyInfoAction,
  saveDescriptionAction,
  saveGoalsAction,
  savePersonalAction,
  savePreferencesAction,
  submitVerificationAction,
} from "@/actions/organization";
import { COMPANY_SIZES, PARTNERSHIP_GOALS } from "@/lib/validation/schemas";
import { cn, titleCase } from "@/lib/utils";
import type { Category, Industry, VerificationStatus } from "@/types/db";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type CompanyRecord = Record<string, any> & {
  id: string;
  contacts?: { email?: string | null; phone?: string | null; address?: string | null } | null;
  services?: { name: string; kind: "product" | "service"; description: string | null }[];
  prefs?: { category_id: string; direction: "offered" | "wanted" }[];
};

function ImagePicker({ name, current, label, square }: { name: string; current?: string | null; label: string; square?: boolean }) {
  const [preview, setPreview] = React.useState<string | null>(current ?? null);
  return (
    <div className="flex items-center gap-4">
      <Avatar src={preview} name={label} square={square} className="size-16 text-lg" />
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium shadow-xs hover:bg-secondary">
        <Upload className="size-4" /> {preview ? "Change" : "Upload"} {label.toLowerCase()}
        <input
          type="file"
          name={name}
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setPreview(URL.createObjectURL(f));
          }}
        />
      </label>
      <span className="text-xs text-muted-foreground">PNG, JPG or WebP · max 5 MB</span>
    </div>
  );
}

// ─── Personal ───────────────────────────────────────────────────────────
export function PersonalForm({
  profile,
  onSaved,
  submitLabel = "Save & continue",
}: {
  profile: { fullName: string; designation: string; phone: string; avatarUrl: string | null; email: string };
  onSaved?: () => void;
  submitLabel?: string;
}) {
  const { run, pending, fieldErrors } = useAction(savePersonalAction);
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await run(new FormData(e.currentTarget));
        if (res.ok) onSaved?.();
      }}
    >
      <ImagePicker name="avatar" current={profile.avatarUrl} label="Photo" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="fullName" error={fieldErrors.fullName} required>
          <Input id="fullName" name="fullName" defaultValue={profile.fullName} required />
        </Field>
        <Field label="Work email" hint="Your sign-in email">
          <Input value={profile.email} disabled readOnly />
        </Field>
        <Field label="Designation" htmlFor="designation" error={fieldErrors.designation} required>
          <Input id="designation" name="designation" defaultValue={profile.designation} placeholder="e.g. Head of Partnerships" required />
        </Field>
        <Field label="Phone number" htmlFor="phone" error={fieldErrors.phone}>
          <Input id="phone" name="phone" type="tel" defaultValue={profile.phone} placeholder="+91 98765 43210" />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ─── Company information ────────────────────────────────────────────────
export function CompanyInfoForm({
  company,
  industries,
  onSaved,
  submitLabel = "Save & continue",
}: {
  company: CompanyRecord | null;
  industries: Industry[];
  onSaved?: (orgId: string) => void;
  submitLabel?: string;
}) {
  const { run, pending, fieldErrors } = useAction(saveCompanyInfoAction);
  const parents = industries.filter((i) => !i.parent_id);
  const [industryId, setIndustryId] = React.useState<string>(company?.industry_id ?? "");
  const subs = industries.filter((i) => i.parent_id === industryId);

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await run(new FormData(e.currentTarget));
        if (res.ok && res.data) onSaved?.(res.data.organizationId);
      }}
    >
      {company?.id && <input type="hidden" name="organizationId" value={company.id} />}
      <ImagePicker name="logo" current={company?.logo_url} label="Logo" square />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name" htmlFor="name" error={fieldErrors.name} required className="sm:col-span-2">
          <Input id="name" name="name" defaultValue={company?.name ?? ""} required />
        </Field>
        <Field label="Website" htmlFor="website" error={fieldErrors.website}>
          <Input id="website" name="website" defaultValue={company?.website ?? ""} placeholder="https://example.com" />
        </Field>
        <Field label="Company email" htmlFor="email" error={fieldErrors.email} hint="Private by default — control visibility in Privacy settings">
          <Input id="email" name="email" type="email" defaultValue={company?.contacts?.email ?? ""} />
        </Field>
        <Field label="Phone" htmlFor="phone" error={fieldErrors.phone}>
          <Input id="phone" name="phone" type="tel" defaultValue={company?.contacts?.phone ?? ""} />
        </Field>
        <Field label="Year established" htmlFor="yearEstablished" error={fieldErrors.yearEstablished}>
          <Input id="yearEstablished" name="yearEstablished" type="number" min={1800} max={new Date().getFullYear()} defaultValue={company?.year_established ?? ""} />
        </Field>
        <Field label="Company size" htmlFor="companySize" error={fieldErrors.companySize} required>
          <NativeSelect id="companySize" name="companySize" defaultValue={company?.company_size ?? ""} required>
            <option value="" disabled>
              Select size
            </option>
            {COMPANY_SIZES.map((s) => (
              <option key={s} value={s}>
                {s} employees
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Industry" htmlFor="industryId" error={fieldErrors.industryId} required>
          <NativeSelect id="industryId" name="industryId" value={industryId} onChange={(e) => setIndustryId(e.target.value)} required>
            <option value="" disabled>
              Select industry
            </option>
            {parents.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Sub-industry" htmlFor="subIndustryId" error={fieldErrors.subIndustryId}>
          <NativeSelect id="subIndustryId" name="subIndustryId" defaultValue={company?.sub_industry_id ?? ""} key={industryId} disabled={!subs.length}>
            <option value="">{subs.length ? "Select sub-industry" : "—"}</option>
            {subs.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Business registration country" htmlFor="registrationCountry" error={fieldErrors.registrationCountry} required>
          <Input id="registrationCountry" name="registrationCountry" defaultValue={company?.registration_country ?? "India"} required />
        </Field>
        <Field label="Headquarters country" htmlFor="country" error={fieldErrors.country} required>
          <Input id="country" name="country" defaultValue={company?.country ?? "India"} required />
        </Field>
        <Field label="State / region" htmlFor="state" error={fieldErrors.state}>
          <Input id="state" name="state" defaultValue={company?.state ?? ""} />
        </Field>
        <Field label="City" htmlFor="city" error={fieldErrors.city} required>
          <Input id="city" name="city" defaultValue={company?.city ?? ""} required />
        </Field>
        <Field label="Company address" htmlFor="address" error={fieldErrors.address} className="sm:col-span-2" hint="Only visible to your team and active partners">
          <Textarea id="address" name="address" rows={2} defaultValue={company?.contacts?.address ?? ""} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ─── Description ────────────────────────────────────────────────────────
export function DescriptionForm({ company, onSaved, submitLabel = "Save & continue" }: { company: CompanyRecord; onSaved?: () => void; submitLabel?: string }) {
  const { run, pending, fieldErrors } = useAction(saveDescriptionAction);
  const [services, setServices] = React.useState<{ name: string; kind: "product" | "service"; description: string }[]>(
    (company.services ?? []).map((s) => ({ name: s.name, kind: s.kind, description: s.description ?? "" })),
  );
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const res = await run(company.id, {
          shortDescription: fd.get("shortDescription"),
          overview: fd.get("overview"),
          mission: fd.get("mission"),
          capabilities: fd.get("capabilities"),
          targetCustomers: fd.get("targetCustomers"),
          targetMarkets: fd.get("targetMarkets"),
          locationsServed: fd.get("locationsServed"),
          industriesServed: fd.get("industriesServed"),
          services: services.filter((s) => s.name.trim()),
        });
        if (res.ok) onSaved?.();
      }}
    >
      <Field label="Short description" htmlFor="shortDescription" error={fieldErrors.shortDescription} hint="One or two sentences shown on company cards (20–280 characters)" required>
        <Textarea id="shortDescription" name="shortDescription" rows={2} maxLength={280} defaultValue={company.short_description ?? ""} required />
      </Field>
      <Field label="Detailed company overview" htmlFor="overview" error={fieldErrors.overview} required>
        <Textarea id="overview" name="overview" rows={6} defaultValue={company.overview ?? ""} required />
      </Field>
      <Field label="Mission & capabilities statement" htmlFor="mission" error={fieldErrors.mission}>
        <Textarea id="mission" name="mission" rows={3} defaultValue={company.mission ?? ""} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Key capabilities" htmlFor="capabilities" hint="Comma-separated, e.g. React, E-commerce, SEO">
          <Input id="capabilities" name="capabilities" defaultValue={(company.capabilities ?? []).join(", ")} />
        </Field>
        <Field label="Target markets / customer segments" htmlFor="targetMarkets" hint="Comma-separated, e.g. SMBs, Retail, Hospitality">
          <Input id="targetMarkets" name="targetMarkets" defaultValue={(company.target_markets ?? []).join(", ")} />
        </Field>
        <Field label="Locations served" htmlFor="locationsServed" hint="Comma-separated cities, states or countries">
          <Input id="locationsServed" name="locationsServed" defaultValue={(company.locations_served ?? []).join(", ")} />
        </Field>
        <Field label="Industries served" htmlFor="industriesServed" hint="Comma-separated">
          <Input id="industriesServed" name="industriesServed" defaultValue={(company.industries_served ?? []).join(", ")} />
        </Field>
      </div>
      <Field label="Target customers" htmlFor="targetCustomers" error={fieldErrors.targetCustomers}>
        <Textarea id="targetCustomers" name="targetCustomers" rows={2} defaultValue={company.target_customers ?? ""} placeholder="Who are your ideal customers?" />
      </Field>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">Products & services</p>
            <p className="text-xs text-muted-foreground">Used in search and partner matching.</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => setServices((s) => [...s, { name: "", kind: "service", description: "" }])} disabled={services.length >= 30}>
            <Plus /> Add
          </Button>
        </div>
        {services.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No products or services added yet.</p>}
        {services.map((s, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-border bg-slate-50/50 p-3 sm:grid-cols-[1fr_130px_1.4fr_auto]">
            <Input aria-label="Name" placeholder="Name" value={s.name} onChange={(e) => setServices((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <NativeSelect aria-label="Type" value={s.kind} onChange={(e) => setServices((all) => all.map((x, j) => (j === i ? { ...x, kind: e.target.value as "product" | "service" } : x)))}>
              <option value="service">Service</option>
              <option value="product">Product</option>
            </NativeSelect>
            <Input aria-label="Description" placeholder="Short description" value={s.description} onChange={(e) => setServices((all) => all.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => setServices((all) => all.filter((_, j) => j !== i))}>
              <Trash2 />
            </Button>
          </div>
        ))}
        {Object.keys(fieldErrors).some((k) => k.startsWith("services")) && <p className="text-xs text-destructive">Each product/service needs a name of at least 2 characters.</p>}
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ─── Preferences ────────────────────────────────────────────────────────
function ChipGroup({ options, value, onChange }: { options: { id: string; label: string; hint?: string | null }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            title={o.hint ?? undefined}
            aria-pressed={active}
            onClick={() => onChange(active ? value.filter((v) => v !== o.id) : [...value, o.id])}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all",
              active ? "border-accent bg-accent text-white shadow-sm" : "border-border bg-card text-slate-700 hover:border-slate-300 hover:bg-slate-50",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function PreferencesForm({ company, categories, onSaved, submitLabel = "Save & continue" }: { company: CompanyRecord; categories: Category[]; onSaved?: () => void; submitLabel?: string }) {
  const { run, pending, fieldErrors } = useAction(savePreferencesAction);
  const prefs = company.prefs ?? [];
  const [offered, setOffered] = React.useState(prefs.filter((p) => p.direction === "offered").map((p) => p.category_id));
  const [wanted, setWanted] = React.useState(prefs.filter((p) => p.direction === "wanted").map((p) => p.category_id));
  const [open, setOpen] = React.useState<boolean>(company.open_to_partnership ?? true);
  const options = categories.map((c) => ({ id: c.id, label: c.name, hint: c.description }));
  return (
    <form
      className="space-y-7"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await run(company.id, { offered, wanted, openToPartnership: open });
        if (res.ok) onSaved?.();
      }}
    >
      <div className="space-y-3">
        <div>
          <p className="font-medium text-slate-900">Partnerships we are looking for</p>
          <p className="text-sm text-muted-foreground">The kinds of partners you want to find.</p>
        </div>
        <ChipGroup options={options} value={wanted} onChange={setWanted} />
      </div>
      <div className="space-y-3">
        <div>
          <p className="font-medium text-slate-900">Partnerships we offer</p>
          <p className="text-sm text-muted-foreground">How other companies can partner with you.</p>
        </div>
        <ChipGroup options={options} value={offered} onChange={setOffered} />
      </div>
      {fieldErrors.wanted && <p className="text-sm text-destructive">{fieldErrors.wanted}</p>}
      <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-slate-50/50 p-4">
        <span>
          <span className="block text-sm font-medium text-slate-900">Open to new partnership requests</span>
          <span className="block text-xs text-muted-foreground">Turn off to stay listed but signal you&apos;re not currently accepting requests.</span>
        </span>
        <Switch checked={open} onCheckedChange={setOpen} aria-label="Open to partnerships" />
      </label>
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ─── Goals ──────────────────────────────────────────────────────────────
export function GoalsForm({ company, onSaved, submitLabel = "Save & continue" }: { company: CompanyRecord; onSaved?: () => void; submitLabel?: string }) {
  const { run, pending, fieldErrors } = useAction(saveGoalsAction);
  const [goals, setGoals] = React.useState<string[]>(company.partnership_goals ?? []);
  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await run(company.id, { goals });
        if (res.ok) onSaved?.();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PARTNERSHIP_GOALS.map((g) => {
          const active = goals.includes(g);
          return (
            <button
              type="button"
              key={g}
              aria-pressed={active}
              onClick={() => setGoals((all) => (active ? all.filter((x) => x !== g) : [...all, g]))}
              className={cn(
                "rounded-xl border p-4 text-left text-sm font-medium transition-all",
                active ? "border-accent bg-blue-50 text-blue-900 ring-2 ring-accent/20" : "border-border bg-card text-slate-700 hover:border-slate-300",
              )}
            >
              {titleCase(g)}
            </button>
          );
        })}
      </div>
      {fieldErrors.goals && <p className="text-sm text-destructive">{fieldErrors.goals}</p>}
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ─── Verification ───────────────────────────────────────────────────────
export function VerificationForm({
  company,
  verification,
  onSaved,
}: {
  company: CompanyRecord;
  verification: { status: VerificationStatus; reviewer_notes?: string | null; domain_verification_token?: string | null; domain?: string | null } | null;
  onSaved?: () => void;
}) {
  const { run, pending, fieldErrors } = useAction(submitVerificationAction);
  const status = (company.verification_status ?? "not_submitted") as VerificationStatus;
  const [files, setFiles] = React.useState<File[]>([]);
  const canSubmit = status !== "pending" && status !== "verified";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-slate-50/60 p-4">
        <ShieldCheck className="size-5 text-accent" />
        <span className="text-sm font-medium text-slate-700">Current status:</span>
        <VerificationBadge status={status} />
        {verification?.reviewer_notes && (status === "info_required" || status === "rejected") && (
          <p className="w-full rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <strong>Reviewer notes:</strong> {verification.reviewer_notes}
          </p>
        )}
      </div>
      <p className="flex gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        The verified badge is granted only after our team reviews your documents. Uploading documents alone does not verify a company.
      </p>
      {verification?.domain && verification.domain_verification_token && (
        <div className="rounded-xl border border-border p-4 text-sm">
          <p className="font-medium text-slate-900">Domain verification (optional, speeds up review)</p>
          <p className="mt-1 text-muted-foreground">
            Add a DNS TXT record on <strong>{verification.domain}</strong>:
          </p>
          <code className="mt-2 block overflow-x-auto rounded-md bg-slate-900 px-3 py-2 text-xs text-green-300">partnerbridge-verification={verification.domain_verification_token}</code>
        </div>
      )}
      {canSubmit ? (
        <form
          noValidate
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.delete("documents");
            files.forEach((f) => fd.append("documents", f));
            const res = await run(company.id, fd);
            if (res.ok) onSaved?.();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Registration country" htmlFor="registrationCountry" error={fieldErrors.registrationCountry} required>
              <Input id="registrationCountry" name="registrationCountry" defaultValue={company.registration_country ?? "India"} />
            </Field>
            <Field label="Registration type" htmlFor="registrationType" error={fieldErrors.registrationType} required>
              <NativeSelect id="registrationType" name="registrationType" defaultValue="Private Limited Company">
                {["Private Limited Company", "Public Limited Company", "LLP", "Partnership Firm", "Sole Proprietorship", "One Person Company", "Other"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Registration number (CIN / LLPIN / Udyam)" htmlFor="registrationNumber" error={fieldErrors.registrationNumber} required>
              <Input id="registrationNumber" name="registrationNumber" />
            </Field>
            <Field label="GSTIN / Tax ID" htmlFor="taxId" error={fieldErrors.taxId}>
              <Input id="taxId" name="taxId" />
            </Field>
            <Field label="Company domain" htmlFor="domain" error={fieldErrors.domain} hint="We'll give you a DNS record to prove ownership">
              <Input id="domain" name="domain" defaultValue={company.website ?? ""} />
            </Field>
            <div />
            <Field label="Authorized representative" htmlFor="representativeName" error={fieldErrors.representativeName} required>
              <Input id="representativeName" name="representativeName" />
            </Field>
            <Field label="Representative designation" htmlFor="representativeDesignation" error={fieldErrors.representativeDesignation} required>
              <Input id="representativeDesignation" name="representativeDesignation" />
            </Field>
            <Field label="Representative email" htmlFor="representativeEmail" error={fieldErrors.representativeEmail} required>
              <Input id="representativeEmail" name="representativeEmail" type="email" />
            </Field>
            <Field label="Representative phone" htmlFor="representativePhone" error={fieldErrors.representativePhone}>
              <Input id="representativePhone" name="representativePhone" type="tel" />
            </Field>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Business documents</p>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 px-6 py-8 text-center hover:border-accent hover:bg-blue-50/40">
              <Upload className="size-6 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">Upload certificate of incorporation, GST certificate, etc.</span>
              <span className="text-xs text-muted-foreground">PDF, PNG or JPG · up to 5 files · 10 MB each · stored privately</span>
              <input type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
            </label>
            {files.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {files.map((f) => (
                  <Badge key={f.name} variant="outline">
                    <FileText /> {f.name}
                  </Badge>
                ))}
              </ul>
            )}
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={pending}>
              Submit for verification
            </Button>
          </div>
        </form>
      ) : (
        <p className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
          {status === "pending" ? "Your documents are under review. We'll notify you when a decision is made." : "Your company is verified. 🎉"}
        </p>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import { EyeOff, Rocket, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/overlays";
import { useAction } from "@/components/shared/use-action";
import { publishProfileAction, updateBrandingAction, updatePrivacyAction, updateSocialAction } from "@/actions/organization";

export function BrandingForm({ logo, cover }: { logo: string | null; cover: string | null }) {
  const { run, pending } = useAction(updateBrandingAction);
  const [coverPreview, setCoverPreview] = React.useState(cover);
  const [logoPreview, setLogoPreview] = React.useState(logo);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        await run(new FormData(e.currentTarget));
      }}
    >
      <div className="relative h-36 overflow-hidden rounded-xl bg-gradient-to-br from-navy-900 to-accent">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {coverPreview && <img src={coverPreview} alt="Cover preview" className="size-full object-cover" />}
        <label className="absolute bottom-3 right-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium shadow hover:bg-white">
          <Upload className="size-3.5" /> Cover image
          <input type="file" name="cover" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && setCoverPreview(URL.createObjectURL(e.target.files[0]))} />
        </label>
      </div>
      <div className="flex items-center gap-4">
        <div className="size-16 overflow-hidden rounded-xl border border-border bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logoPreview && <img src={logoPreview} alt="Logo preview" className="size-full object-cover" />}
        </div>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary">
          <Upload className="size-4" /> Logo
          <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && setLogoPreview(URL.createObjectURL(e.target.files[0]))} />
        </label>
        <Button type="submit" className="ml-auto" loading={pending}>
          Save branding
        </Button>
      </div>
    </form>
  );
}

export function SocialForm({ links }: { links: Record<string, string> }) {
  const { run, pending, fieldErrors } = useAction(updateSocialAction);
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        await run(new FormData(e.currentTarget));
      }}
    >
      {["linkedin", "twitter", "facebook", "instagram", "youtube"].map((k) => (
        <Field key={k} label={k[0]!.toUpperCase() + k.slice(1)} error={fieldErrors[k]}>
          <Input name={k} defaultValue={links[k] ?? ""} placeholder={`https://${k}.com/…`} />
        </Field>
      ))}
      <div className="flex items-end justify-end">
        <Button type="submit" loading={pending}>
          Save links
        </Button>
      </div>
    </form>
  );
}

export function PrivacyForm({ privacy }: { privacy: { show_email?: boolean; show_phone?: boolean; show_activity?: boolean } }) {
  const { run, pending } = useAction(updatePrivacyAction);
  const [v, setV] = React.useState({ show_email: !!privacy.show_email, show_phone: !!privacy.show_phone, show_activity: privacy.show_activity !== false });
  const rows: [keyof typeof v, string, string][] = [
    ["show_email", "Show company email publicly", "Otherwise only your team and active partners can see it."],
    ["show_phone", "Show phone number publicly", "Otherwise only your team and active partners can see it."],
    ["show_activity", "Show public partnership activity", "Displays your number of active partnerships and opportunities on your profile."],
  ];
  return (
    <div className="space-y-3">
      {rows.map(([k, title, desc]) => (
        <label key={k} className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
          <span>
            <span className="block text-sm font-medium text-slate-900">{title}</span>
            <span className="block text-xs text-muted-foreground">{desc}</span>
          </span>
          <Switch checked={v[k]} onCheckedChange={(c) => setV((s) => ({ ...s, [k]: c }))} />
        </label>
      ))}
      <div className="flex justify-end">
        <Button loading={pending} onClick={() => run(v)}>
          Save privacy settings
        </Button>
      </div>
    </div>
  );
}

export function PublishToggle({ orgId, published }: { orgId: string; published: boolean }) {
  const { run, pending } = useAction(publishProfileAction);
  return published ? (
    <Button variant="outline" loading={pending} onClick={() => run(orgId, false)}>
      <EyeOff /> Unpublish profile
    </Button>
  ) : (
    <Button variant="accent" loading={pending} onClick={() => run(orgId, true)}>
      <Rocket /> Publish profile
    </Button>
  );
}

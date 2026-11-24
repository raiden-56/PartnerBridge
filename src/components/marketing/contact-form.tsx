"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/primitives";
import { useAction } from "@/components/shared/use-action";
import { contactFormAction } from "@/actions/marketplace";

export function ContactForm() {
  const [done, setDone] = React.useState(false);
  const { run, pending, fieldErrors } = useAction(contactFormAction, { refresh: false });
  if (done)
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-10 text-center">
        <CheckCircle2 className="size-10 text-success" />
        <p className="font-semibold text-green-900">Message received</p>
        <p className="text-sm text-green-800">We&apos;ll get back to you within two business days.</p>
      </div>
    );
  return (
    <form
      noValidate
      className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await run(new FormData(e.currentTarget));
        if (res.ok) setDone(true);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="c-name" error={fieldErrors.name} required>
          <Input id="c-name" name="name" autoComplete="name" />
        </Field>
        <Field label="Work email" htmlFor="c-email" error={fieldErrors.email} required>
          <Input id="c-email" name="email" type="email" autoComplete="email" />
        </Field>
      </div>
      <Field label="Company" htmlFor="c-company" error={fieldErrors.company}>
        <Input id="c-company" name="company" autoComplete="organization" />
      </Field>
      <Field label="How can we help?" htmlFor="c-message" error={fieldErrors.message} required>
        <Textarea id="c-message" name="message" rows={4} />
      </Field>
      {/* Honeypot for bots */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <Button type="submit" className="w-full" loading={pending}>
        Send message
      </Button>
      <p className="text-xs text-muted-foreground">We use your details only to respond to this enquiry.</p>
    </form>
  );
}

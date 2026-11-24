"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Separator } from "@/components/ui/primitives";
import { useAction } from "@/components/shared/use-action";
import {
  forgotPasswordAction,
  loginAction,
  oauthAction,
  registerAction,
  resendVerificationAction,
  resetPasswordAction,
} from "@/actions/auth";
import { publicEnv } from "@/lib/env";

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-10" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function OAuthButtons({ next }: { next?: string }) {
  if (!publicEnv.googleAuth && !publicEnv.azureAuth) return null;
  return (
    <>
      <div className="grid gap-2">
        {publicEnv.googleAuth && (
          <form action={oauthAction.bind(null, "google", next)}>
            <Button type="submit" variant="outline" className="w-full">
              <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
                <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z" />
                <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.9l4-3.1Z" />
                <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
              </svg>
              Continue with Google
            </Button>
          </form>
        )}
        {publicEnv.azureAuth && (
          <form action={oauthAction.bind(null, "azure", next)}>
            <Button type="submit" variant="outline" className="w-full">
              <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
                <path fill="#F25022" d="M1 1h10v10H1z" />
                <path fill="#7FBA00" d="M13 1h10v10H13z" />
                <path fill="#00A4EF" d="M1 13h10v10H1z" />
                <path fill="#FFB900" d="M13 13h10v10H13z" />
              </svg>
              Continue with Microsoft
            </Button>
          </form>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <Separator className="flex-1" /> or <Separator className="flex-1" />
      </div>
    </>
  );
}

export function LoginForm({ next, error }: { next?: string; error?: string }) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction(loginAction, { refresh: false });
  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error === "suspended"
            ? "This account has been suspended. Contact support."
            : error === "link_invalid"
              ? "That link is invalid or has expired. Please request a new one."
              : "Sign-in failed. Please try again."}
        </p>
      )}
      <OAuthButtons next={next} />
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await run(new FormData(e.currentTarget));
          if (res.ok && res.data) {
            router.replace(res.data.redirectTo);
            router.refresh();
          }
        }}
        noValidate
      >
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="Work email" htmlFor="email" error={fieldErrors.email}>
          <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!fieldErrors.email} />
        </Field>
        <Field
          label={
            <span className="flex w-full items-center justify-between">
              Password
              <Link href="/forgot-password" className="text-xs font-medium text-accent hover:underline">
                Forgot password?
              </Link>
            </span>
          }
          htmlFor="password"
          error={fieldErrors.password}
        >
          <PasswordInput id="password" name="password" autoComplete="current-password" required aria-invalid={!!fieldErrors.password} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={pending}>
          Sign in
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        New to PartnerBridge?{" "}
        <Link href="/register" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export function RegisterForm({ next }: { next?: string }) {
  const router = useRouter();
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const { run, pending, fieldErrors } = useAction(registerAction, { refresh: false });

  if (sentTo) return <VerifyEmailNotice email={sentTo} />;

  return (
    <div className="space-y-6">
      <OAuthButtons next={next ?? "/onboarding"} />
      <form
        className="space-y-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const res = await run(fd);
          if (res.ok) {
            if (res.data?.needsVerification) setSentTo(String(fd.get("email")));
            else router.replace(res.data?.next ?? "/onboarding");
          }
        }}
      >
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="Full name" htmlFor="fullName" error={fieldErrors.fullName} required>
          <Input id="fullName" name="fullName" autoComplete="name" required aria-invalid={!!fieldErrors.fullName} />
        </Field>
        <Field label="Work email" htmlFor="email" error={fieldErrors.email} required>
          <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!fieldErrors.email} />
        </Field>
        <Field label="Password" htmlFor="password" error={fieldErrors.password} hint="At least 8 characters with a letter and a number." required>
          <PasswordInput id="password" name="password" autoComplete="new-password" required aria-invalid={!!fieldErrors.password} />
        </Field>
        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input type="checkbox" name="acceptTerms" className="mt-0.5 size-4 rounded border-slate-300 accent-[#2563eb]" required />
          <span>
            I agree to the{" "}
            <Link href="/terms" className="text-accent hover:underline" target="_blank">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-accent hover:underline" target="_blank">
              Privacy Policy
            </Link>
            , and consent to processing of my data to operate my account.
          </span>
        </label>
        {fieldErrors.acceptTerms && <p className="text-xs text-destructive">{fieldErrors.acceptTerms}</p>}
        <Button type="submit" className="w-full" size="lg" loading={pending}>
          Create account
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export function VerifyEmailNotice({ email }: { email: string }) {
  const { run, pending } = useAction(resendVerificationAction, { refresh: false });
  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-accent">
        <MailCheck className="size-7" />
      </div>
      <div>
        <h2 className="text-xl font-bold">Check your inbox</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We sent a verification link to <strong className="text-slate-900">{email}</strong>. Click it to activate your account and set up your company.
        </p>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await run(new FormData(e.currentTarget));
        }}
      >
        <input type="hidden" name="email" value={email} />
        <Button variant="outline" type="submit" loading={pending}>
          Resend email
        </Button>
      </form>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [done, setDone] = React.useState(false);
  const { run, pending, fieldErrors } = useAction(forgotPasswordAction, { refresh: false });
  if (done)
    return (
      <p className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        If an account exists for that email, you&apos;ll receive a password reset link shortly.
      </p>
    );
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await run(new FormData(e.currentTarget));
        if (res.ok) setDone(true);
      }}
    >
      <Field label="Work email" htmlFor="email" error={fieldErrors.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Button type="submit" className="w-full" loading={pending}>
        Send reset link
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-accent hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction(resetPasswordAction, { refresh: false });
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await run(new FormData(e.currentTarget));
        if (res.ok) router.replace("/dashboard");
      }}
    >
      <Field label="New password" htmlFor="password" error={fieldErrors.password}>
        <PasswordInput id="password" name="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" error={fieldErrors.confirm}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required />
      </Field>
      <Button type="submit" className="w-full" loading={pending}>
        Update password
      </Button>
    </form>
  );
}

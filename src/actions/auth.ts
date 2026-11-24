"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { runAction, formToObject, UserFacingError, type ActionResult } from "@/lib/actions";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { emailOnlySchema, loginSchema, registerSchema, resetPasswordSchema } from "@/lib/validation/schemas";
import { absoluteUrl, safeRedirectPath } from "@/lib/utils";
import { getPlatformSetting } from "@/lib/settings";
import { requireUser } from "@/lib/auth/session";

export async function registerAction(fd: FormData): Promise<ActionResult<{ needsVerification: boolean; next: string }>> {
  return runAction(async () => {
    const input = registerSchema.parse(formToObject(fd));
    await enforceRateLimit("auth_per_10_minutes", await clientIp());
    const allowed = await getPlatformSetting<boolean>("allow_new_registrations", true);
    if (allowed === false) throw new UserFacingError("New registrations are temporarily paused. Please try again later.");

    const next = safeRedirectPath(String(fd.get('next') ?? ''), '/onboarding');
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { full_name: input.fullName },
        emailRedirectTo: absoluteUrl(`/auth/callback?next=${encodeURIComponent(next)}`),
      },
    });
    if (error) {
      if (/registered|exists/i.test(error.message)) throw new UserFacingError("An account with this email already exists. Try signing in.");
      throw new UserFacingError(error.message);
    }
    // When email confirmation is enabled Supabase returns no session.
    return { ok: true, data: { needsVerification: !data.session, next } };
  });
}

export async function loginAction(fd: FormData): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const input = loginSchema.parse(formToObject(fd));
    await enforceRateLimit("auth_per_10_minutes", `${await clientIp()}:${input.email}`);
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(input);
    if (error) {
      if (/confirm/i.test(error.message)) throw new UserFacingError("Please verify your email address first. Check your inbox for the link.");
      throw new UserFacingError("Invalid email or password.");
    }
    const next = safeRedirectPath(String(fd.get("next") ?? ""), "/dashboard");
    return { ok: true, data: { redirectTo: next } };
  });
}

export async function oauthAction(provider: "google" | "azure", next?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: absoluteUrl(`/auth/callback?next=${encodeURIComponent(safeRedirectPath(next, "/dashboard"))}`),
      scopes: provider === "azure" ? "email openid profile" : undefined,
    },
  });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}

export async function forgotPasswordAction(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { email } = emailOnlySchema.parse(formToObject(fd));
    await enforceRateLimit("auth_per_10_minutes", `${await clientIp()}:reset`);
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: absoluteUrl("/auth/callback?next=/reset-password") });
    // Always succeed to avoid account enumeration.
    return { ok: true, message: "If an account exists, a reset link is on its way." };
  });
}

export async function resetPasswordAction(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await requireUser();
    const { password } = resetPasswordSchema.parse(formToObject(fd));
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new UserFacingError(error.message);
    return { ok: true, message: "Password updated" };
  });
}

export async function resendVerificationAction(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { email } = emailOnlySchema.parse(formToObject(fd));
    await enforceRateLimit("auth_per_10_minutes", `${await clientIp()}:resend`);
    const supabase = await createClient();
    await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: absoluteUrl("/auth/callback?next=/onboarding") } });
    return { ok: true, message: "Verification email sent (if the account is pending)." };
  });
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login?signedOut=1");
}

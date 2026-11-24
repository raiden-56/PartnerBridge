import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { getUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  if (!(await getUser())) redirect("/login?error=link_invalid");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Choose a new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">Use at least 8 characters including a letter and a number.</p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { getProfile, getUser } from "@/lib/auth/session";
import { isPlatformStaff } from "@/lib/auth/permissions";
import { LocalDemoBar } from "@/components/demo/local-demo-bar";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · PartnerBridge Admin" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login?next=/admin");
  const profile = await getProfile();
  if (!profile || !isPlatformStaff(profile.platform_role) || profile.is_suspended) notFound();
  return (
    <>
      <div className="lg:pl-64">
        <LocalDemoBar />
      </div>
      <AdminShell role={profile.platform_role as "moderator" | "super_admin"} name={profile.full_name ?? profile.email}>
      {children}
      </AdminShell>
    </>
  );
}

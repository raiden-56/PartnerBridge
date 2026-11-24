import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/primitives";
import { CompanyLogo, EmptyState, PageHeader, StatusBadge } from "@/components/shared/common";
import { AdminAction, VerificationDocButton } from "@/components/admin/admin-controls";
import { requireAdminPage } from "@/lib/auth/admin-page";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewVerificationAction } from "@/actions/admin";
import { formatDate, websiteHost } from "@/lib/utils";

export default async function AdminVerification({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminPage("verification");
  const { status = "pending" } = await searchParams;
  const admin = createAdminClient();
  const { data } = await admin
    .from("organization_verifications")
    .select("*, organization:organizations(id, name, slug, logo_url, website, registration_country)")
    .eq("status", status)
    .order("submitted_at", { ascending: true })
    .limit(100);
  return (
    <>
      <PageHeader title="Company verification" description="Review registration details and documents. Only approve when the evidence matches the company." />
      <div className="mb-4 flex gap-1.5">
        {["pending", "info_required", "verified", "rejected"].map((s) => (
          <Link key={s} href={`/admin/verification?status=${s}`} className={`rounded-full border px-3 py-1 text-xs capitalize ${status === s ? "border-accent bg-blue-50 text-accent" : "border-border bg-white"}`}>
            {s.replace("_", " ")}
          </Link>
        ))}
      </div>
      {(data ?? []).length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Queue is empty" />
      ) : (
        <div className="space-y-4">
          {(data ?? []).map((v) => {
            const o = v.organization as { id: string; name: string; slug: string; logo_url: string | null; website: string | null };
            const domainMatch = v.domain && o.website && websiteHost(o.website) === v.domain.replace(/^www\./, "");
            const emailMatch = v.domain && v.representative_email?.endsWith("@" + v.domain);
            return (
              <Card key={v.id}>
                <CardContent className="grid gap-5 pt-5 lg:grid-cols-[1fr_320px]">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <CompanyLogo name={o.name} src={o.logo_url} />
                      <div>
                        <Link href={`/companies/${o.slug}`} target="_blank" className="font-semibold hover:text-accent">
                          {o.name}
                        </Link>
                        <p className="text-xs text-slate-500">Submitted {formatDate(v.submitted_at)}</p>
                      </div>
                      <StatusBadge status={v.status} />
                    </div>
                    <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                      {[
                        ["Registration", `${v.registration_type ?? "—"} · ${v.registration_country ?? "—"}`],
                        ["Registration no.", v.registration_number],
                        ["Tax ID", v.tax_id],
                        ["Domain", `${v.domain ?? "—"} ${v.domain ? (domainMatch ? "✓ matches website" : "⚠ differs from website") : ""}`],
                        ["Representative", `${v.representative_name} (${v.representative_designation})`],
                        ["Rep. email", `${v.representative_email} ${v.domain ? (emailMatch ? "✓ on company domain" : "⚠ not on company domain") : ""}`],
                        ["Rep. phone", v.representative_phone],
                        ["DNS token", v.domain_verification_token],
                      ].map(([k, val]) => (
                        <div key={k as string}>
                          <dt className="text-xs text-slate-500">{k}</dt>
                          <dd className="break-all text-slate-800">{(val as string) || "—"}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="flex flex-wrap gap-2">
                      {(v.documents as { path: string; name: string }[]).map((d) => (
                        <VerificationDocButton key={d.path} verificationId={v.id} path={d.path} name={d.name} />
                      ))}
                    </div>
                    {v.reviewer_notes && <p className="rounded-lg bg-slate-50 p-2 text-xs">Notes: {v.reviewer_notes}</p>}
                  </div>
                  {["pending", "info_required"].includes(v.status) && (
                    <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-4">
                      <p className="text-xs text-muted-foreground">Decision is shared with the company and recorded in the audit log.</p>
                      <AdminAction label="Approve & verify" variant="success" action={reviewVerificationAction.bind(null, v.id, "verified")} prompt="Internal note (optional)" confirmTitle={`Verify ${o.name}?`} />
                      <AdminAction label="Request more information" action={reviewVerificationAction.bind(null, v.id, "info_required")} prompt="What is missing?" confirmTitle="Request information" />
                      <AdminAction label="Reject" variant="destructive" action={reviewVerificationAction.bind(null, v.id, "rejected")} prompt="Reason for rejection" confirmTitle="Reject verification" />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

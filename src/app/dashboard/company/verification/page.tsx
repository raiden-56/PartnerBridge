import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/primitives";
import { PageHeader } from "@/components/shared/common";
import { VerificationForm } from "@/components/company/forms";
import { requireOrgPage } from "@/lib/auth/session";
import { getEditableCompany } from "@/lib/queries/reference";

export const metadata: Metadata = { title: "Company verification" };

export default async function VerificationPage() {
  const ctx = await requireOrgPage("verification.manage");
  const { org, verification } = await getEditableCompany(ctx.orgId);
  if (!org) return null;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Company verification" description="Verified companies are reviewed by PartnerBridge moderators and display a verified badge across the marketplace." />
      <Card>
        <CardContent className="pt-6">
          <VerificationForm company={org} verification={verification} />
        </CardContent>
      </Card>
    </div>
  );
}

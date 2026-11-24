import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/primitives";
import { PageHeader } from "@/components/shared/common";
import { OpportunityForm } from "@/components/opportunities/opportunity-form";
import { requireOrgPage } from "@/lib/auth/session";
import { getCategories, getIndustries } from "@/lib/queries/reference";

export const metadata: Metadata = { title: "Post an opportunity" };

export default async function NewOpportunityPage() {
  await requireOrgPage("opportunities.manage");
  const [categories, industries] = await Promise.all([getCategories(), getIndustries()]);
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/opportunities" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900">
        <ArrowLeft className="size-4" /> My opportunities
      </Link>
      <PageHeader title="Post a partnership opportunity" description="Describe the partner you're looking for. Published opportunities appear in the public marketplace." />
      <Card>
        <CardContent className="pt-6">
          <OpportunityForm opportunity={null} categories={categories} industries={industries} />
        </CardContent>
      </Card>
    </div>
  );
}

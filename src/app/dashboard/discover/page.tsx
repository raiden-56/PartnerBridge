import type { Metadata } from "next";
import { Suspense } from "react";
import { CompanyDirectory, type SP } from "@/components/company/company-directory";
import { DirectorySkeleton } from "@/components/shared/skeletons";
import { PageHeader } from "@/components/shared/common";

export const metadata: Metadata = { title: "Discover companies" };

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Discover companies" description="Search the marketplace by industry, location, capabilities and partnership types." />
      <Suspense key={JSON.stringify(sp)} fallback={<DirectorySkeleton />}>
        <CompanyDirectory searchParams={sp} basePath="/dashboard/discover" />
      </Suspense>
    </>
  );
}

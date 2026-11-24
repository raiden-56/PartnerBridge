import type { Metadata } from "next";
import { Suspense } from "react";
import { CompanyDirectory, type SP } from "@/components/company/company-directory";
import { DirectorySkeleton } from "@/components/shared/skeletons";

export const metadata: Metadata = {
  title: "Discover Companies",
  description: "Search and filter companies by industry, location, capabilities and partnership types.",
};

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">Company discovery</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Discover business partners</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">Find distributors, resellers, technology, marketing and supply-chain partners across industries.</p>
      </div>
      <Suspense key={JSON.stringify(sp)} fallback={<DirectorySkeleton />}>
        <CompanyDirectory searchParams={sp} basePath="/companies" />
      </Suspense>
    </div>
  );
}

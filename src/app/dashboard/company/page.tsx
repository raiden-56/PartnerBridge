import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { PageHeader, StatusBadge, VerificationBadge } from "@/components/shared/common";
import { CompanyInfoForm, DescriptionForm, GoalsForm, PreferencesForm } from "@/components/company/forms";
import { BrandingForm, PrivacyForm, PublishToggle, SocialForm } from "@/components/company/profile-extras";
import { requireOrgPage } from "@/lib/auth/session";
import { getCategories, getEditableCompany, getIndustries } from "@/lib/queries/reference";

export const metadata: Metadata = { title: "Company profile" };

export default async function CompanyPage() {
  const ctx = await requireOrgPage();
  const [{ org, contacts, services, prefs }, industries, categories] = await Promise.all([getEditableCompany(ctx.orgId), getIndustries(), getCategories()]);
  if (!org) return null;
  const company = { ...org, contacts, services, prefs };
  const canEdit = ctx.can("profile.manage");

  return (
    <>
      <PageHeader
        title="Company profile"
        description="This is how other businesses see your company in the marketplace."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/companies/${org.slug}`} target="_blank">
                <ExternalLink /> View public profile
              </Link>
            </Button>
            {canEdit && <PublishToggle orgId={org.id} published={org.profile_status === "published"} />}
          </>
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">Visibility:</span> <StatusBadge status={org.profile_status} />
        <span className="ml-2 text-muted-foreground">Verification:</span> <VerificationBadge status={org.verification_status} />
        <Link href="/dashboard/company/verification" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
          <ShieldCheck className="size-4" /> Manage verification
        </Link>
      </div>
      {!canEdit ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">Only owners, admins or members with “profile” permission can edit the company profile.</CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="details">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="description">Description & services</TabsTrigger>
            <TabsTrigger value="partnerships">Partnership types</TabsTrigger>
            <TabsTrigger value="goals">Goals</TabsTrigger>
            <TabsTrigger value="branding">Branding & links</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
          </TabsList>
          <Card className="mt-4">
            <CardContent className="pt-6">
              <TabsContent value="details" className="mt-0">
                <CompanyInfoForm company={company} industries={industries} submitLabel="Save changes" />
              </TabsContent>
              <TabsContent value="description" className="mt-0">
                <DescriptionForm company={company} submitLabel="Save changes" />
              </TabsContent>
              <TabsContent value="partnerships" className="mt-0">
                <PreferencesForm company={company} categories={categories} submitLabel="Save changes" />
              </TabsContent>
              <TabsContent value="goals" className="mt-0">
                <GoalsForm company={company} submitLabel="Save changes" />
              </TabsContent>
              <TabsContent value="branding" className="mt-0 space-y-8">
                <BrandingForm logo={org.logo_url} cover={org.cover_url} />
                <div>
                  <CardHeader className="px-0">
                    <CardTitle>Social links</CardTitle>
                    <CardDescription>Shown on your public profile.</CardDescription>
                  </CardHeader>
                  <SocialForm links={org.social_links ?? {}} />
                </div>
              </TabsContent>
              <TabsContent value="privacy" className="mt-0">
                <PrivacyForm privacy={org.privacy ?? {}} />
              </TabsContent>
            </CardContent>
          </Card>
        </Tabs>
      )}
    </>
  );
}

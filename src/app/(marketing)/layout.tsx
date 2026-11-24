import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { AnnouncementBar } from "@/components/marketing/announcement-bar";
import { getUser } from "@/lib/auth/session";
import { LocalDemoBar } from "@/components/demo/local-demo-bar";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <LocalDemoBar />
      <AnnouncementBar audience="public" />
      <SiteHeader signedIn={!!user} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

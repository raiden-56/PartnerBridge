import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarClock, Coins, Eye, Gift, Handshake, MapPin, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { CompanyLogo, DemoBadge, StatusBadge, VerificationBadge } from "@/components/shared/common";
import { AttachmentLink, ReceiverActions, SenderActions } from "@/components/requests/request-actions";
import { requireOrgPage } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { markRequestViewed } from "@/actions/requests";
import { formatDate, timeAgo } from "@/lib/utils";
import type { FileRef } from "@/types/db";

export const metadata: Metadata = { title: "Partnership request" };

type Org = { id: string; name: string; slug: string; logo_url: string | null; verification_status: "verified"; city: string | null; country: string | null; short_description: string | null; is_demo: boolean };

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireOrgPage("requests.manage");
  const supabase = await createClient();
  const { data } = await supabase
    .from("partnership_requests")
    .select(
      "*, category:partnership_categories(name), sender:organizations!partnership_requests_sender_organization_id_fkey(id, name, slug, logo_url, verification_status, city, country, short_description, is_demo), receiver:organizations!partnership_requests_receiver_organization_id_fkey(id, name, slug, logo_url, verification_status, city, country, short_description, is_demo)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const r = data as typeof data & { sender: Org; receiver: Org; category: { name: string } | null; attachments: FileRef[] };

  const isReceiver = r.receiver_organization_id === ctx.orgId;
  const isSender = r.sender_organization_id === ctx.orgId;
  if (!isReceiver && !isSender) notFound();
  if (isReceiver && r.status === "sent") {
    await markRequestViewed(id);
    r.status = "viewed";
  }
  const other = isReceiver ? r.sender : r.receiver;

  const timeline = [
    r.created_at && { label: "Created", at: r.created_at },
    r.sent_at && { label: "Sent", at: r.sent_at },
    r.viewed_at && { label: "Viewed by recipient", at: r.viewed_at },
    r.responded_at && { label: r.status === "accepted" ? "Accepted" : "Responded", at: r.responded_at },
  ].filter(Boolean) as { label: string; at: string }[];

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/dashboard/requests?tab=${isReceiver ? "incoming" : r.status === "draft" ? "drafts" : "outgoing"}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900">
        <ArrowLeft className="size-4" /> Requests
      </Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={r.status} />
            {r.category && <Badge variant="accent">{r.category.name}</Badge>}
            <Badge variant="outline">{isReceiver ? "Incoming" : "Outgoing"}</Badge>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{r.subject}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isReceiver ? "Received" : r.status === "draft" ? "Draft created" : "Sent"} {timeAgo(r.sent_at ?? r.created_at)}
            {r.expires_at && ["sent", "viewed"].includes(r.status) && ` · expires ${formatDate(r.expires_at)}`}
          </p>
        </div>
        <div className="shrink-0">
          {isReceiver && ["sent", "viewed", "negotiation"].includes(r.status) && ctx.can("requests.manage") && <ReceiverActions requestId={r.id} companyName={r.sender.name} />}
          {isSender && <SenderActions requestId={r.id} status={r.status} />}
          {r.status === "accepted" && r.partnership_id && (
            <Button asChild variant="accent">
              <Link href={`/dashboard/partnerships/${r.partnership_id}`}>
                <Handshake /> Open workspace <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Introduction</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{r.introduction}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Proposed collaboration</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{r.proposed_collaboration}</p>
            </CardContent>
          </Card>
          <div className="grid gap-5 sm:grid-cols-2">
            {r.expected_benefits && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Gift className="size-4 text-accent" /> Expected benefits
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-line text-sm text-slate-700">{r.expected_benefits}</p>
                </CardContent>
              </Card>
            )}
            {r.commercial_model && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Coins className="size-4 text-accent" /> Commercial model
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-line text-sm text-slate-700">{r.commercial_model}</p>
                </CardContent>
              </Card>
            )}
          </div>
          {r.attachments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Attachments</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {(r.attachments as FileRef[]).map((a: FileRef) => (
                  <AttachmentLink key={a.path} requestId={r.id} path={a.path} name={a.name} />
                ))}
              </CardContent>
            </Card>
          )}
          {r.response_message && (
            <Card className="border-blue-100 bg-blue-50/40">
              <CardHeader>
                <CardTitle className="text-sm">Response from {r.receiver.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line text-sm text-slate-700">{r.response_message}</p>
              </CardContent>
            </Card>
          )}
        </div>
        <aside className="space-y-5">
          <Card>
            <CardContent className="space-y-3 pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{isReceiver ? "From" : "To"}</p>
              <div className="flex items-center gap-3">
                <CompanyLogo name={other.name} src={other.logo_url} />
                <div className="min-w-0">
                  <Link href={`/companies/${other.slug}`} className="flex items-center gap-1 font-semibold text-slate-900 hover:text-accent">
                    {other.name} <VerificationBadge status={other.verification_status} compact showUnverified={false} />
                  </Link>
                  <p className="flex items-center gap-1 text-xs text-slate-500">
                    <MapPin className="size-3" /> {[other.city, other.country].filter(Boolean).join(", ")}
                  </p>
                </div>
              </div>
              {other.is_demo && <DemoBadge />}
              <p className="text-sm text-slate-600">{other.short_description}</p>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href={`/companies/${other.slug}`}>View company profile</Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {timeline.map((t) => (
                  <li key={t.label} className="flex items-start gap-2.5 text-sm">
                    {t.label.startsWith("Viewed") ? <Eye className="mt-0.5 size-4 text-violet-500" /> : t.label === "Sent" ? <Send className="mt-0.5 size-4 text-accent" /> : <CalendarClock className="mt-0.5 size-4 text-slate-400" />}
                    <span>
                      <span className="block text-slate-800">{t.label}</span>
                      <span className="text-xs text-slate-500">{formatDate(t.at, "d MMM yyyy, HH:mm")}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

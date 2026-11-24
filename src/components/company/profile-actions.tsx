"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Flag, MessageSquare, MoreHorizontal, Send, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/overlays";
import { Field, NativeSelect, Textarea } from "@/components/ui/primitives";
import { useAction } from "@/components/shared/use-action";
import { SaveCompanyButton } from "./save-button";
import { blockCompanyAction, reportAction, startDirectConversationAction } from "@/actions/marketplace";

export function ProfileActions({
  org,
  signedIn,
  saved,
  isOwnCompany,
  canMessage,
  blocked,
}: {
  org: { id: string; slug: string; name: string; open_to_partnership: boolean };
  signedIn: boolean;
  saved: boolean;
  isOwnCompany: boolean;
  canMessage: boolean;
  blocked: boolean;
}) {
  const router = useRouter();
  const contact = useAction(startDirectConversationAction, { refresh: false });
  const block = useAction(blockCompanyAction);
  const requestHref = `/dashboard/requests/new?to=${org.slug}`;

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: org.name, url });
      } catch {
        /* cancelled */
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Profile link copied");
    }
  };

  if (isOwnCompany) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/dashboard/company">Edit company profile</Link>
        </Button>
        <Button variant="outline" onClick={share}>
          <Share2 /> Share
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {org.open_to_partnership ? (
        <Button asChild variant="accent">
          <Link href={signedIn ? requestHref : `/login?next=${encodeURIComponent(requestHref)}`}>
            <Send /> Send partnership request
          </Link>
        </Button>
      ) : (
        <Button variant="outline" disabled title="This company is not accepting requests right now">
          Not accepting requests
        </Button>
      )}
      <Button
        variant="outline"
        loading={contact.pending}
        onClick={async () => {
          if (!signedIn) return router.push(`/login?next=/companies/${org.slug}`);
          if (!canMessage) return toast.error("Your role doesn't allow direct company messaging. Ask an admin for access.");
          const res = await contact.run(org.id);
          if (res.ok && res.data) router.push(`/dashboard/messages/${res.data.conversationId}`);
        }}
      >
        <MessageSquare /> Contact
      </Button>
      <SaveCompanyButton orgId={org.id} initialSaved={saved} signedIn={signedIn} withLabel />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={share}>
            <Share2 /> Share profile
          </DropdownMenuItem>
          {signedIn && (
            <>
              <ReportDialog targetType="organization" targetId={org.id} trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}><Flag /> Report company</DropdownMenuItem>} />
              <DropdownMenuItem onSelect={() => block.run(org.id, !blocked)} className="text-destructive">
                <Ban /> {blocked ? "Unblock company" : "Block company"}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function ReportDialog({ targetType, targetId, trigger }: { targetType: "organization" | "opportunity" | "request" | "message" | "user"; targetId: string; trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const { run, pending, fieldErrors } = useAction(reportAction, { refresh: false });
  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Report {targetType}</DialogTitle>
            <DialogDescription>Reports are reviewed by PartnerBridge moderators. The reported party is not told who reported them.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const res = await run({ targetType, targetId, reason: fd.get("reason"), details: fd.get("details") });
              if (res.ok) setOpen(false);
            }}
          >
            <Field label="Reason" error={fieldErrors.reason}>
              <NativeSelect name="reason" defaultValue="spam">
                {["spam", "fraud", "impersonation", "misleading", "inappropriate", "harassment", "other"].map((r) => (
                  <option key={r} value={r}>
                    {r[0]!.toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Details" error={fieldErrors.details}>
              <Textarea name="details" rows={3} placeholder="Help moderators understand what happened" />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" loading={pending}>
                Submit report
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

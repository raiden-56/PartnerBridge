"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, MoreHorizontal, Pause, Play, Rocket, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlays";
import { Textarea } from "@/components/ui/primitives";
import { useAction } from "@/components/shared/use-action";
import { changeOpportunityStatusAction, deleteOpportunityAction, reviewApplicationAction } from "@/actions/opportunities";
import type { ApplicationStatus } from "@/types/db";

export function OpportunityStatusControls({ id, status, accepting }: { id: string; status: string; accepting: boolean }) {
  const router = useRouter();
  const change = useAction(changeOpportunityStatusAction);
  const del = useAction(deleteOpportunityAction, { refresh: false });
  return (
    <div className="flex flex-wrap gap-2">
      {status === "published" && (
        <Button asChild variant="outline">
          <Link href={`/opportunities/${id}`} target="_blank">
            <ExternalLink /> View public page
          </Link>
        </Button>
      )}
      {(status === "draft" || status === "paused") && (
        <Button variant="accent" loading={change.pending} onClick={() => change.run(id, "publish")}>
          <Rocket /> {status === "paused" ? "Resume" : "Publish"}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {status === "published" && (
            <>
              <DropdownMenuItem onSelect={() => change.run(id, "toggle_applications")}>{accepting ? <Pause /> : <Play />} {accepting ? "Pause applications" : "Reopen applications"}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => change.run(id, "pause")}>
                <Pause /> Pause listing
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => change.run(id, "unpublish")}>
                <XCircle /> Unpublish (back to draft)
              </DropdownMenuItem>
            </>
          )}
          {status !== "closed" && (
            <DropdownMenuItem onSelect={() => change.run(id, "close")}>
              <XCircle /> Close opportunity
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <ConfirmDialog
            trigger={
              <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                <Trash2 /> Delete
              </DropdownMenuItem>
            }
            title="Delete this opportunity?"
            description="It will be removed from the marketplace. Existing applications remain visible to applicants as closed."
            confirmLabel="Delete"
            onConfirm={async () => {
              const res = await del.run(id);
              if (res.ok) router.push("/dashboard/opportunities");
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function ApplicationReviewControls({ id, status, notes }: { id: string; status: ApplicationStatus; notes: string | null }) {
  const router = useRouter();
  const review = useAction(reviewApplicationAction);
  const [note, setNote] = React.useState(notes ?? "");
  if (["accepted", "withdrawn"].includes(status)) return null;
  return (
    <div className="space-y-3">
      <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Private notes for your team (not shared with applicant)" className="text-xs" />
      <div className="flex flex-wrap gap-2">
        {status === "submitted" && (
          <Button size="sm" variant="outline" onClick={() => review.run(id, "under_review", note)} loading={review.pending}>
            Mark under review
          </Button>
        )}
        {status !== "shortlisted" && status !== "rejected" && (
          <Button size="sm" variant="outline" onClick={() => review.run(id, "shortlisted", note)}>
            Shortlist
          </Button>
        )}
        {status !== "discussion" && status !== "rejected" && (
          <Button size="sm" variant="outline" onClick={() => review.run(id, "discussion", note)}>
            In discussion
          </Button>
        )}
        {status !== "rejected" ? (
          <Button size="sm" variant="outline" className="text-destructive" onClick={() => review.run(id, "rejected", note)}>
            Reject
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => review.run(id, "under_review", note)}>
            Reconsider
          </Button>
        )}
        {status !== "rejected" && (
          <ConfirmDialog
            trigger={
              <Button size="sm" variant="success">
                <Check /> Accept
              </Button>
            }
            variant="success"
            title="Accept this applicant?"
            description="A private partnership workspace will be created for both companies."
            confirmLabel="Accept & create workspace"
            onConfirm={async () => {
              const res = await review.run(id, "accepted", note);
              if (res.ok && res.data?.partnershipId) router.push(`/dashboard/partnerships/${res.data.partnershipId}`);
            }}
          />
        )}
      </div>
    </div>
  );
}

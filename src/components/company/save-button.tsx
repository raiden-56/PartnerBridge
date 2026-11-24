"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toggleSaveCompanyAction } from "@/actions/marketplace";

export function SaveCompanyButton({ orgId, initialSaved, signedIn, withLabel }: { orgId: string; initialSaved: boolean; signedIn: boolean; withLabel?: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = React.useState(initialSaved);
  const [pending, setPending] = React.useState(false);
  return (
    <Button
      size={withLabel ? "default" : "icon-sm"}
      variant={withLabel ? "outline" : "ghost"}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save company"}
      disabled={pending}
      onClick={async () => {
        if (!signedIn) {
          router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        setPending(true);
        setSaved((s) => !s);
        const res = await toggleSaveCompanyAction(orgId);
        setPending(false);
        if (!res.ok) {
          setSaved((s) => !s);
          toast.error(res.error);
        } else toast.success(res.data?.saved ? "Company saved" : "Removed from saved");
      }}
    >
      {saved ? <BookmarkCheck className="text-accent" /> : <Bookmark />}
      {withLabel && (saved ? "Saved" : "Save")}
    </Button>
  );
}

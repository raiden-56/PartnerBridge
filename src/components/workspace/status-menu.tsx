"use client";

import { MoreHorizontal, Pause, Play, XOctagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/overlays";
import { useAction } from "@/components/shared/use-action";
import { changePartnershipStatusAction } from "@/actions/workspace";

export function PartnershipStatusMenu({ pid, status }: { pid: string; status: string }) {
  const { run } = useAction(changePartnershipStatusAction);
  if (status === "ended") return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" className="text-white hover:bg-white/15" aria-label="Partnership actions">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {status === "active" ? (
          <DropdownMenuItem onSelect={() => run(pid, "paused")}>
            <Pause /> Pause partnership
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => run(pid, "active")}>
            <Play /> Resume partnership
          </DropdownMenuItem>
        )}
        <ConfirmDialog
          trigger={
            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
              <XOctagon /> End partnership
            </DropdownMenuItem>
          }
          title="End this partnership?"
          description="The workspace becomes read-only for messaging. History, documents and deals remain available to both companies."
          confirmLabel="End partnership"
          onConfirm={() => run(pid, "ended")}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

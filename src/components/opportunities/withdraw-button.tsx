"use client";

import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlays";
import { useAction } from "@/components/shared/use-action";
import { withdrawApplicationAction } from "@/actions/opportunities";

export function WithdrawApplicationButton({ id }: { id: string }) {
  const { run } = useAction(withdrawApplicationAction);
  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant="outline">
          <Undo2 /> Withdraw
        </Button>
      }
      title="Withdraw application?"
      description="The opportunity owner will be notified. You can't re-apply to the same opportunity."
      confirmLabel="Withdraw"
      onConfirm={() => run(id)}
    />
  );
}

"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/shared/use-action";
import { acceptInvitationAction } from "@/actions/team";

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const { run, pending } = useAction(acceptInvitationAction, { refresh: false });
  return (
    <Button
      className="w-full"
      variant="accent"
      loading={pending}
      onClick={async () => {
        const r = await run(token);
        if (r.ok) router.push("/dashboard");
      }}
    >
      Accept invitation
    </Button>
  );
}

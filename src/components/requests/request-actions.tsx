"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Download, MessagesSquare, Send, Trash2, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { Field, Textarea } from "@/components/ui/primitives";
import { useAction } from "@/components/shared/use-action";
import { deleteDraftAction, requestAttachmentUrlAction, respondToRequestAction, sendDraftAction, withdrawRequestAction } from "@/actions/requests";

export function ReceiverActions({ requestId, companyName }: { requestId: string; companyName: string }) {
  const router = useRouter();
  const respond = useAction(respondToRequestAction, { refresh: true });
  const [mode, setMode] = React.useState<null | "accept" | "reject" | "negotiate">(null);
  const [message, setMessage] = React.useState("");

  const titles = {
    accept: { title: `Accept partnership with ${companyName}?`, desc: "A private shared workspace will be created for both companies.", cta: "Accept & create workspace", variant: "success" as const },
    reject: { title: "Decline this request?", desc: "The sender will be notified. You can include a short, courteous reason.", cta: "Decline request", variant: "destructive" as const },
    negotiate: { title: "Start a discussion", desc: "Opens a private conversation so you can clarify terms before deciding.", cta: "Start discussion", variant: "accent" as const },
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="success" onClick={() => setMode("accept")}>
          <Check /> Accept
        </Button>
        <Button variant="outline" onClick={() => setMode("negotiate")}>
          <MessagesSquare /> Start discussion
        </Button>
        <Button variant="outline" className="text-destructive hover:bg-red-50" onClick={() => setMode("reject")}>
          <X /> Reject
        </Button>
      </div>
      <Dialog open={!!mode} onOpenChange={(o) => !o && setMode(null)}>
        {mode && (
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>{titles[mode].title}</DialogTitle>
              <DialogDescription>{titles[mode].desc}</DialogDescription>
            </DialogHeader>
            <Field label={mode === "negotiate" ? "Opening message" : "Message (optional)"}>
              <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} />
            </Field>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMode(null)}>
                Cancel
              </Button>
              <Button
                variant={titles[mode].variant}
                loading={respond.pending}
                onClick={async () => {
                  const res = await respond.run(requestId, mode, message);
                  if (res.ok) {
                    setMode(null);
                    if (res.data?.partnershipId) router.push(`/dashboard/partnerships/${res.data.partnershipId}`);
                    else if (res.data?.conversationId) router.push(`/dashboard/messages/${res.data.conversationId}`);
                  }
                }}
              >
                {titles[mode].cta}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

export function SenderActions({ requestId, status }: { requestId: string; status: string }) {
  const router = useRouter();
  const withdraw = useAction(withdrawRequestAction);
  const send = useAction(sendDraftAction);
  const del = useAction(deleteDraftAction, { refresh: false });
  if (status === "draft")
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="accent" loading={send.pending} onClick={() => send.run(requestId)}>
          <Send /> Send now
        </Button>
        <ConfirmDialog
          trigger={
            <Button variant="outline">
              <Trash2 /> Delete draft
            </Button>
          }
          title="Delete this draft?"
          description="This cannot be undone."
          confirmLabel="Delete"
          onConfirm={async () => {
            const res = await del.run(requestId);
            if (res.ok) router.push("/dashboard/requests?tab=drafts");
          }}
        />
      </div>
    );
  if (["sent", "viewed", "negotiation"].includes(status))
    return (
      <ConfirmDialog
        trigger={
          <Button variant="outline">
            <Undo2 /> Withdraw request
          </Button>
        }
        title="Withdraw this request?"
        description="The company will be notified that you withdrew the request."
        confirmLabel="Withdraw"
        onConfirm={() => withdraw.run(requestId)}
      />
    );
  return null;
}

export function AttachmentLink({ requestId, path, name, kind = "request" }: { requestId: string; path: string; name: string; kind?: "request" | "application" }) {
  const [pending, setPending] = React.useState(false);
  return (
    <button
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-secondary disabled:opacity-50"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const action = kind === "request" ? requestAttachmentUrlAction : (await import("@/actions/opportunities")).applicationAttachmentUrlAction;
        const res = await action(requestId, path);
        setPending(false);
        if (res.ok && res.data) window.open(res.data.url, "_blank", "noopener");
        else if (!res.ok) toast.error(res.error);
      }}
    >
      <Download className="size-3.5" /> {name}
    </button>
  );
}

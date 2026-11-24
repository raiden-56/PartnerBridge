"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  startCheckoutAction,
  startTrialAction,
  verifyCheckoutAction,
  cancelSubscriptionAction,
  completeDemoPaymentAction,
  type CheckoutSession,
} from "@/actions/billing";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/overlays";
import { useAction } from "@/components/shared/use-action";

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => {
      open(): void;
      on(ev: string, cb: (r: { error: { description: string } }) => void): void;
    };
  }
}

function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export function CheckoutButton({
  planCode,
  cycle,
  label,
  variant = "accent",
  disabled,
}: {
  planCode: string;
  cycle: "monthly" | "yearly";
  label: string;
  variant?: "accent" | "outline";
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [demo, setDemo] = React.useState<CheckoutSession | null>(null);
  const [demoPending, setDemoPending] = React.useState<
    "success" | "failure" | null
  >(null);

  const finishDemo = async (outcome: "success" | "failure") => {
    if (!demo) return;
    setDemoPending(outcome);
    const v = await completeDemoPaymentAction({
      orderId: demo.orderId,
      outcome,
    });
    setDemoPending(null);
    setDemo(null);
    setPending(false);
    if (v.ok) {
      (outcome === "success" ? toast.success : toast.info)(v.message ?? "Done");
      router.refresh();
    } else toast.error(v.error);
  };

  return (
    <>
      <Dialog
        open={!!demo}
        onOpenChange={(o) => {
          if (!o && !demoPending) {
            setDemo(null);
            setPending(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Demo checkout</DialogTitle>
            <DialogDescription>
              Local demo mode — this is a simulated payment. No payment window
              opens and no money moves.
            </DialogDescription>
          </DialogHeader>
          {demo && (
            <div className="rounded-lg border bg-secondary/40 p-4 text-sm">
              <p className="font-medium">
                {demo.planName} · {cycle}
              </p>
              <p className="mt-1 text-muted-foreground">
                {new Intl.NumberFormat("en-IN", {
                  style: "currency",
                  currency: demo.currency,
                }).format(demo.amount / 100)}{" "}
                for {demo.companyName}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              loading={demoPending === "failure"}
              disabled={!!demoPending}
              onClick={() => finishDemo("failure")}
            >
              Simulate failure
            </Button>
            <Button
              variant="accent"
              loading={demoPending === "success"}
              disabled={!!demoPending}
              onClick={() => finishDemo("success")}
            >
              Simulate successful payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button
        className="w-full"
        variant={variant}
        disabled={disabled}
        loading={pending}
        onClick={async () => {
          if (!navigator.onLine)
            return toast.error("Payments need an internet connection.");
          setPending(true);
          const res = await startCheckoutAction({ planCode, cycle });
          if (!res.ok || !res.data) {
            setPending(false);
            if (!res.ok) toast.error(res.error);
            return;
          }
          if (res.data.keyId === "demo") {
            setDemo(res.data);
            return;
          }
          const ok = await loadRazorpay();
          if (!ok || !window.Razorpay) {
            setPending(false);
            return toast.error(
              "Could not load the payment window. Check your connection or ad-blocker.",
            );
          }
          const s = res.data;
          const rzp = new window.Razorpay({
            key: s.keyId,
            order_id: s.orderId,
            amount: s.amount,
            currency: s.currency,
            name: "PartnerBridge",
            description: `${s.planName} — ${cycle}`,
            prefill: { email: s.email, name: s.name },
            notes: { company: s.companyName },
            theme: { color: "#172554" },
            modal: { ondismiss: () => setPending(false) },
            handler: async (r: {
              razorpay_order_id: string;
              razorpay_payment_id: string;
              razorpay_signature: string;
            }) => {
              // Server verifies the HMAC signature — the browser callback alone is never trusted.
              const v = await verifyCheckoutAction({
                orderId: r.razorpay_order_id,
                paymentId: r.razorpay_payment_id,
                signature: r.razorpay_signature,
              });
              setPending(false);
              if (v.ok) {
                toast.success(v.message ?? "Payment verified");
                router.refresh();
              } else toast.error(v.error);
            },
          });
          rzp.on("payment.failed", (r) => {
            setPending(false);
            toast.error(r.error.description || "Payment failed");
          });
          rzp.open();
        }}
      >
        {label}
      </Button>
    </>
  );
}

export function TrialButton({
  planCode,
  days,
}: {
  planCode: string;
  days: number;
}) {
  const { run, pending } = useAction(startTrialAction);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full"
      loading={pending}
      onClick={() => run(planCode)}
    >
      Start {days}-day free trial
    </Button>
  );
}

export function CancelButton({
  resume,
  trial,
}: {
  resume?: boolean;
  trial?: boolean;
}) {
  const { run, pending } = useAction(cancelSubscriptionAction);
  return (
    <Button
      variant={resume ? "accent" : "outline"}
      size="sm"
      loading={pending}
      onClick={() => run(!!resume)}
    >
      {resume ? "Resume renewal" : trial ? "End trial" : "Cancel subscription"}
    </Button>
  );
}

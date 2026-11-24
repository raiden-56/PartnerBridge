"use client";

import * as React from "react";
import { BellRing, BellOff, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/primitives";
import { Switch, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { useAction } from "@/components/shared/use-action";
import { removePushSubscriptionAction, saveNotificationPreferencesAction, savePushSubscriptionAction } from "@/actions/notifications";
import { deleteAccountAction } from "@/actions/account";
import { resetPasswordAction } from "@/actions/auth";
import { NOTIFICATION_TYPES, defaultPrefs, type ChannelPrefs, type NotificationType } from "@/lib/notifications/types";
import { publicEnv } from "@/lib/env";

export function NotificationPreferences({ initial }: { initial: Record<string, Partial<ChannelPrefs>> }) {
  const types = Object.keys(NOTIFICATION_TYPES) as NotificationType[];
  const [prefs, setPrefs] = React.useState<Record<string, ChannelPrefs>>(() => Object.fromEntries(types.map((t) => [t, { ...defaultPrefs(t), ...(initial[t] ?? {}) }])));
  const { run, pending } = useAction(saveNotificationPreferencesAction, { refresh: false });
  const groups = Array.from(new Set(types.map((t) => NOTIFICATION_TYPES[t].group)));
  return (
    <div className="space-y-5">
      <div className="hidden grid-cols-[1fr_70px_70px_70px] gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid">
        <span />
        <span className="text-center">In-app</span>
        <span className="text-center">Email</span>
        <span className="text-center">Push</span>
      </div>
      {groups.map((g) => (
        <div key={g}>
          <p className="mb-1.5 px-3 text-xs font-semibold text-slate-400">{g}</p>
          <div className="divide-y divide-border rounded-lg border border-border">
            {types
              .filter((t) => NOTIFICATION_TYPES[t].group === g)
              .map((t) => (
                <div key={t} className="grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2.5 sm:grid-cols-[1fr_70px_70px_70px]">
                  <span className="text-sm text-slate-700">{NOTIFICATION_TYPES[t].label}</span>
                  <div className="flex gap-4 sm:contents">
                    {(["in_app", "email", "push"] as const).map((c) => (
                      <span key={c} className="flex items-center justify-center gap-1">
                        <span className="text-[10px] text-slate-400 sm:hidden">{c === "in_app" ? "App" : c}</span>
                        <Switch checked={prefs[t]![c]} aria-label={`${NOTIFICATION_TYPES[t].label} ${c}`} onCheckedChange={(v) => setPrefs((p) => ({ ...p, [t]: { ...p[t]!, [c]: v } }))} />
                      </span>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
      <div className="flex justify-end">
        <Button loading={pending} onClick={() => run(prefs)}>
          Save preferences
        </Button>
      </div>
    </div>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Push permission is requested only after an explicit click. */
export function PushToggle() {
  const [state, setState] = React.useState<"unsupported" | "denied" | "off" | "on" | "loading">("loading");
  React.useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !publicEnv.vapidPublicKey) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
  }, []);

  const enable = async () => {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      setState(perm === "denied" ? "denied" : "off");
      return toast.error("Notification permission was not granted.");
    }
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicEnv.vapidPublicKey) });
    const res = await savePushSubscriptionAction(sub.toJSON(), navigator.userAgent);
    if (res.ok) {
      setState("on");
      toast.success("Push notifications enabled on this device");
    } else toast.error(res.error);
  };
  const disable = async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await removePushSubscriptionAction(sub.endpoint);
      await sub.unsubscribe();
    }
    setState("off");
    toast.success("Push notifications disabled on this device");
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center">
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-900">Browser push notifications</p>
        <p className="text-xs text-muted-foreground">
          {state === "unsupported"
            ? "Not available in this browser, or push is not configured on this deployment. On iOS, install the app to your Home Screen first."
            : state === "denied"
              ? "Blocked in your browser settings. Allow notifications for this site to enable."
              : "Get notified about requests and messages even when PartnerBridge isn't open. We only ask for permission when you click enable."}
        </p>
      </div>
      {state === "on" ? (
        <Button variant="outline" onClick={disable}>
          <BellOff /> Disable on this device
        </Button>
      ) : (
        <Button onClick={enable} disabled={state !== "off"}>
          <BellRing /> Enable push
        </Button>
      )}
    </div>
  );
}

export function PasswordForm() {
  const { run, pending, fieldErrors } = useAction(resetPasswordAction, { refresh: false });
  return (
    <form
      className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const r = await run(new FormData(form));
        if (r.ok) form.reset();
      }}
    >
      <Field label="New password" error={fieldErrors.password}>
        <Input type="password" name="password" autoComplete="new-password" />
      </Field>
      <Field label="Confirm password" error={fieldErrors.confirm}>
        <Input type="password" name="confirm" autoComplete="new-password" />
      </Field>
      <Button type="submit" loading={pending}>
        Update password
      </Button>
    </form>
  );
}

export function DataControls() {
  const [open, setOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState("");
  const { run, pending } = useAction(deleteAccountAction, { refresh: false });
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-900">Export my data</p>
          <p className="text-xs text-muted-foreground">Download a JSON copy of your personal data, messages you sent and your activity.</p>
        </div>
        <Button asChild variant="outline">
          <a href="/api/account/export">
            <Download /> Export
          </a>
        </Button>
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50/50 p-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="text-sm font-medium text-red-900">Delete my account</p>
          <p className="text-xs text-red-800/80">Permanently removes your account and personal data. Companies you solely own are deleted too. This cannot be undone.</p>
        </div>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          <Trash2 /> Delete account
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>Type DELETE to confirm. You must transfer ownership of companies with other members first.</DialogDescription>
          </DialogHeader>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" />
          <DialogFooter>
            <Button variant="destructive" disabled={confirm !== "DELETE"} loading={pending} onClick={() => run(confirm)}>
              Permanently delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

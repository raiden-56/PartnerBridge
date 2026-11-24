"use client";

import * as React from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Share, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pb-install-dismissed-at";

/**
 * Registers the service worker, shows a custom install prompt, an offline indicator
 * and an "update available" notification. Mounted once in the root layout.
 */
export function PwaProvider() {
  const [installEvent, setInstallEvent] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = React.useState(false);
  const [online, setOnline] = React.useState(true);

  // Service worker registration + update flow.
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_SW_DEV !== "true") return;

    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        const promptUpdate = (worker: ServiceWorker) => {
          toast("A new version of PartnerBridge is available", {
            duration: Infinity,
            action: { label: "Update", onClick: () => worker.postMessage({ type: "SKIP_WAITING" }) },
          });
        };
        if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          nw?.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) promptUpdate(nw);
          });
        });
        // Periodically check for updates while the app is open.
        const id = window.setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
        return () => window.clearInterval(id);
      })
      .catch((e) => console.warn("SW registration failed", e));

    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  // Install prompt.
  React.useEffect(() => {
    const dismissed = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    const recentlyDismissed = Date.now() - dismissed < 14 * 86400_000;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
    if (standalone || recentlyDismissed) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    let t: number | undefined;
    if (isIos) t = window.setTimeout(() => setShowIos(true), 20000);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      if (t) window.clearTimeout(t);
    };
  }, []);

  // Network status.
  React.useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => {
      setOnline(true);
      toast.success("Back online");
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setInstallEvent(null);
    setShowIos(false);
  };

  return (
    <>
      <AnimatePresence>
        {!online && (
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            role="status"
            className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-xs font-medium text-white shadow"
          >
            <WifiOff className="size-3.5" />
            You&apos;re offline — you can browse cached public pages. Messaging, requests and uploads need a connection.
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(installEvent || showIos) && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-md rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-lift)] md:bottom-6"
            role="dialog"
            aria-label="Install PartnerBridge"
          >
            <button onClick={dismiss} className="absolute right-3 top-3 rounded p-1 text-slate-400 hover:bg-secondary" aria-label="Dismiss">
              <X className="size-4" />
            </button>
            <div className="flex gap-3 pr-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon-192.png" alt="" className="size-11 rounded-xl" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">Install PartnerBridge</p>
                {installEvent ? (
                  <p className="text-xs text-muted-foreground">Get an app-like experience with faster access and notifications.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Tap <Share className="inline size-3.5 align-text-bottom" /> Share, then <strong>Add to Home Screen</strong>.
                  </p>
                )}
              </div>
            </div>
            {installEvent && (
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={dismiss}>
                  Not now
                </Button>
                <Button
                  size="sm"
                  variant="accent"
                  onClick={async () => {
                    await installEvent.prompt();
                    await installEvent.userChoice;
                    setInstallEvent(null);
                  }}
                >
                  <Download /> Install
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Clear user-specific caches & offline outbox in the service worker (called on logout). */
export async function clearUserCaches() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    reg?.active?.postMessage({ type: "CLEAR_USER_DATA" });
    if ("indexedDB" in window) indexedDB.deleteDatabase("pb-outbox");
  } catch {
    /* ignore */
  }
}

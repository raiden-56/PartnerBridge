"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlays";
import { createClient } from "@/lib/supabase/client";
import { publicEnv } from "@/lib/env";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/actions/notifications";
import { cn, timeAgo } from "@/lib/utils";

interface N {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
  type: string;
}

/** Notification bell with Supabase Realtime updates (RLS ensures users only receive their own rows). */
export function NotificationBell({ userId, initialCount }: { userId: string; initialCount: number }) {
  const router = useRouter();
  const [count, setCount] = React.useState(initialCount);
  const [items, setItems] = React.useState<N[] | null>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => setCount(initialCount), [initialCount]);

  React.useEffect(() => {
    if (publicEnv.staticPreview) return;
    const supabase = createClient();
    if (publicEnv.localDemo) {
      // No realtime server locally: poll for notifications newer than the last one seen.
      let since = new Date().toISOString();
      const timer = window.setInterval(async () => {
        if (document.visibilityState !== "visible") return;
        const { data } = await supabase.from("notifications").select("id, title, body, link, read_at, created_at, type").eq("user_id", userId).gt("created_at", since).order("created_at");
        for (const n of (data ?? []) as N[]) {
          since = n.created_at > since ? n.created_at : since;
          setCount((c) => c + 1);
          setItems((list) => (list ? [n, ...list].slice(0, 15) : list));
          toast(n.title, { description: n.body ?? undefined, action: n.link ? { label: "Open", onClick: () => router.push(n.link!) } : undefined });
        }
      }, 10000);
      return () => window.clearInterval(timer);
    }
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload: { new: Record<string, unknown> }) => {
        const n = payload.new as unknown as N;
        setCount((c) => c + 1);
        setItems((list) => (list ? [n, ...list].slice(0, 15) : list));
        toast(n.title, { description: n.body ?? undefined, action: n.link ? { label: "Open", onClick: () => router.push(n.link!) } : undefined });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router]);

  const load = React.useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("notifications").select("id, title, body, link, read_at, created_at, type").order("created_at", { ascending: false }).limit(15);
    setItems((data ?? []) as N[]);
  }, []);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) load();
      }}
    >
      <PopoverTrigger className="relative rounded-full p-2 text-slate-600 hover:bg-secondary" aria-label={`Notifications${count ? ` (${count} unread)` : ""}`}>
        <Bell className="size-5" />
        <AnimatePresence>
          {count > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white ring-2 ring-white"
            >
              {count > 99 ? "99+" : count}
            </motion.span>
          )}
        </AnimatePresence>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {count > 0 && (
            <button
              className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              onClick={async () => {
                await markAllNotificationsReadAction();
                setCount(0);
                setItems((l) => l?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? l);
                router.refresh();
              }}
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items === null ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                className={cn("flex w-full gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-slate-50", !n.read_at && "bg-blue-50/40")}
                onClick={async () => {
                  setOpen(false);
                  if (!n.read_at) {
                    setCount((c) => Math.max(0, c - 1));
                    markNotificationReadAction(n.id);
                  }
                  if (n.link) router.push(n.link);
                }}
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-accent")} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-900">{n.title}</span>
                  {n.body && <span className="block truncate text-xs text-slate-500">{n.body}</span>}
                  <span className="mt-0.5 block text-[11px] text-slate-400">{timeAgo(n.created_at)}</span>
                </span>
              </button>
            ))
          )}
        </div>
        <Link href="/dashboard/notifications" onClick={() => setOpen(false)} className="block border-t border-border py-2.5 text-center text-xs font-medium text-accent hover:bg-slate-50">
          View all notifications
        </Link>
      </PopoverContent>
    </Popover>
  );
}

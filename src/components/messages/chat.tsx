"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCheck, Check, Clock, Download, Paperclip, Send, WifiOff, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/overlays";
import { createClient } from "@/lib/supabase/client";
import { publicEnv } from "@/lib/env";
import { markConversationReadAction, messageAttachmentUrlAction, sendMessageAction } from "@/actions/messages";
import { canBackgroundSync, queueMessage } from "@/lib/pwa/outbox";
import { cn, formatBytes, formatDate } from "@/lib/utils";

export interface ChatMessage {
  id: string;
  body: string;
  sender_id: string | null;
  sender_organization_id: string;
  created_at: string;
  attachments?: { id: string; file_name: string; size_bytes: number }[];
  pending?: boolean;
  queued?: boolean;
}

export function Chat({
  conversationId,
  myUserId,
  myOrgId,
  orgNames,
  people,
  initialMessages,
  initialOtherReadAt,
  readOnly,
}: {
  conversationId: string;
  myUserId: string;
  myOrgId: string;
  orgNames: Record<string, string>;
  people: Record<string, { name: string; avatar: string | null }>;
  initialMessages: ChatMessage[];
  initialOtherReadAt: string | null;
  readOnly?: boolean;
}) {
  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages);
  const [otherReadAt, setOtherReadAt] = React.useState<string | null>(initialOtherReadAt);
  const [body, setBody] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [sending, setSending] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const scrollDown = React.useCallback((smooth = true) => bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" }), []);

  React.useEffect(() => {
    scrollDown(false);
    markConversationReadAction(conversationId);
  }, [conversationId, scrollDown]);

  // Realtime: new messages + read receipts (RLS-filtered on the server).
  // Local demo mode has no realtime server, so it polls the same data instead.
  React.useEffect(() => {
    const supabase = createClient();

    const onMessage = async (m: ChatMessage) => {
      let attachments: ChatMessage["attachments"] = [];
      if (m.sender_id !== myUserId) {
        // Attachments are inserted right after the message; fetch them shortly after.
        await new Promise((r) => setTimeout(r, 600));
        const { data } = await supabase.from("message_attachments").select("id, file_name, size_bytes").eq("message_id", m.id);
        attachments = (data ?? []) as ChatMessage["attachments"];
      }
      let added = false;
      setMessages((list) => {
        if (list.some((x) => x.id === m.id)) return list;
        added = true;
        // Replace optimistic copy from this user.
        const idx = list.findIndex((x) => x.pending && x.sender_id === m.sender_id && x.body === m.body);
        if (idx >= 0) {
          const next = [...list];
          next[idx] = { ...m, attachments: next[idx]!.attachments };
          return next;
        }
        return [...list, { ...m, attachments }];
      });
      if (added && m.sender_id !== myUserId) markConversationReadAction(conversationId);
      if (added) setTimeout(() => scrollDown(), 50);
    };
    const onRead = (r: { organization_id?: string; last_read_at?: string }) => {
      if (r.organization_id && r.organization_id !== myOrgId && r.last_read_at) {
        setOtherReadAt((cur) => (!cur || r.last_read_at! > cur ? r.last_read_at! : cur));
      }
    };

    // Static read-only preview: there is no server to poll.
    if (publicEnv.staticPreview) return;
    if (publicEnv.localDemo) {
      let since = new Date().toISOString();
      const timer = window.setInterval(async () => {
        if (document.visibilityState !== "visible") return;
        const [{ data: fresh }, { data: reads }] = await Promise.all([
          supabase.from("partnership_messages").select("id, body, sender_id, sender_organization_id, created_at").eq("conversation_id", conversationId).is("deleted_at", null).gt("created_at", since).order("created_at"),
          supabase.from("conversation_reads").select("organization_id, last_read_at").eq("conversation_id", conversationId),
        ]);
        for (const m of (fresh ?? []) as ChatMessage[]) {
          since = m.created_at > since ? m.created_at : since;
          await onMessage(m);
        }
        for (const r of reads ?? []) onRead(r as { organization_id?: string; last_read_at?: string });
      }, 3000);
      return () => window.clearInterval(timer);
    }

    const channel = supabase
      .channel(`conv:${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "partnership_messages", filter: `conversation_id=eq.${conversationId}` }, (payload: { new: Record<string, unknown> }) => {
        void onMessage(payload.new as unknown as ChatMessage);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_reads", filter: `conversation_id=eq.${conversationId}` }, (payload: { new: Record<string, unknown> }) => {
        onRead(payload.new as { organization_id?: string; last_read_at?: string });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, myUserId, myOrgId, scrollDown]);

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    const clientId = crypto.randomUUID();
    const optimistic: ChatMessage = {
      id: `tmp-${clientId}`,
      body: text,
      sender_id: myUserId,
      sender_organization_id: myOrgId,
      created_at: new Date().toISOString(),
      pending: true,
      attachments: files.map((f, i) => ({ id: `tmp-${i}`, file_name: f.name, size_bytes: f.size })),
    };

    if (!navigator.onLine) {
      if (files.length) return toast.error("Attachments need an internet connection.");
      if (canBackgroundSync()) {
        await queueMessage({ clientId, conversationId, body: text, createdAt: Date.now() });
        setMessages((l) => [...l, { ...optimistic, queued: true }]);
        setBody("");
        toast("You're offline — the message will send automatically when you reconnect.");
      } else toast.error("You're offline. Messaging needs an internet connection.");
      return;
    }

    setSending(true);
    setMessages((l) => [...l, optimistic]);
    setBody("");
    const sentFiles = files;
    setFiles([]);
    setTimeout(() => scrollDown(), 30);
    const fd = new FormData();
    fd.set("conversationId", conversationId);
    fd.set("body", text);
    fd.set("clientId", clientId);
    sentFiles.forEach((f) => fd.append("files", f));
    const res = await sendMessageAction(fd);
    setSending(false);
    if (!res.ok) {
      setMessages((l) => l.filter((m) => m.id !== optimistic.id));
      setBody(text);
      toast.error(res.error);
    } else if (res.data?.id) {
      const realId = res.data.id;
      setMessages((l) => (l.some((m) => m.id === realId) ? l.filter((m) => m.id !== optimistic.id) : l.map((m) => (m.id === optimistic.id ? { ...m, id: realId, pending: false } : m))));
    }
  };

  const grouped = React.useMemo(() => {
    const out: { day: string; items: ChatMessage[] }[] = [];
    for (const m of messages) {
      const day = formatDate(m.created_at, "EEEE, d MMM yyyy");
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(m);
      else out.push({ day, items: [m] });
    }
    return out;
  }, [messages]);

  const lastMine = [...messages].reverse().find((m) => m.sender_id === myUserId && !m.pending);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5 scrollbar-thin sm:px-6" aria-live="polite">
        {messages.length === 0 && <p className="py-16 text-center text-sm text-muted-foreground">No messages yet. Say hello 👋</p>}
        {grouped.map((g) => (
          <div key={g.day} className="space-y-3">
            <div className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-wide text-slate-400">
              <span className="h-px flex-1 bg-border" />
              {g.day}
              <span className="h-px flex-1 bg-border" />
            </div>
            <AnimatePresence initial={false}>
              {g.items.map((m) => {
                const mine = m.sender_id === myUserId;
                const sameOrg = m.sender_organization_id === myOrgId;
                const person = m.sender_id ? people[m.sender_id] : undefined;
                const read = mine && otherReadAt && otherReadAt >= m.created_at;
                return (
                  <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn("flex gap-2.5", mine && "flex-row-reverse")}>
                    {!mine && <Avatar src={person?.avatar} name={person?.name ?? orgNames[m.sender_organization_id]} className="mt-5 size-8 text-[10px]" />}
                    <div className={cn("max-w-[80%] space-y-1", mine && "items-end text-right")}>
                      {!mine && (
                        <p className="text-xs text-slate-500">
                          <span className="font-medium text-slate-700">{person?.name ?? "Team member"}</span> · {orgNames[m.sender_organization_id]}
                        </p>
                      )}
                      <div
                        className={cn(
                          "inline-block whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-left text-sm shadow-sm",
                          mine ? "rounded-tr-md bg-accent text-white" : sameOrg ? "rounded-tl-md bg-blue-50 text-slate-800" : "rounded-tl-md border border-border bg-white text-slate-800",
                          m.pending && "opacity-70",
                        )}
                      >
                        {m.body}
                        {!!m.attachments?.length && (
                          <div className="mt-2 space-y-1">
                            {m.attachments.map((a) => (
                              <AttachmentChip key={a.id} id={a.id} name={a.file_name} size={a.size_bytes} mine={mine} />
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="flex items-center justify-end gap-1 text-[11px] text-slate-400" style={{ justifyContent: mine ? "flex-end" : "flex-start" }}>
                        {formatDate(m.created_at, "HH:mm")}
                        {mine &&
                          (m.queued ? (
                            <span className="flex items-center gap-0.5 text-amber-600">
                              <WifiOff className="size-3" /> Queued
                            </span>
                          ) : m.pending ? (
                            <Clock className="size-3" />
                          ) : read ? (
                            <CheckCheck className="size-3.5 text-accent" aria-label="Read" />
                          ) : (
                            <Check className="size-3.5" aria-label="Sent" />
                          ))}
                        {mine && read && lastMine?.id === m.id && <span className="text-accent">Seen</span>}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {readOnly ? (
        <p className="border-t border-border bg-slate-50 px-4 py-3 text-center text-sm text-muted-foreground">This conversation is read-only.</p>
      ) : (
        <div className="border-t border-border bg-white p-3 sm:p-4">
          {files.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs">
                  {f.name}
                  <button onClick={() => setFiles((l) => l.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <Button variant="ghost" size="icon" onClick={() => fileRef.current?.click()} aria-label="Attach files">
              <Paperclip />
            </Button>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              maxLength={8000}
              placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
              aria-label="Message"
              className="max-h-40 min-h-10 flex-1 resize-none rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm focus-visible:border-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/15"
            />
            <Button variant="accent" size="icon" onClick={send} disabled={!body.trim()} loading={sending} aria-label="Send message">
              {!sending && <Send />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AttachmentChip({ id, name, size, mine }: { id: string; name: string; size: number; mine: boolean }) {
  return (
    <button
      disabled={id.startsWith("tmp-")}
      onClick={async () => {
        const res = await messageAttachmentUrlAction(id);
        if (res.ok && res.data) window.open(res.data.url, "_blank", "noopener");
        else if (!res.ok) toast.error(res.error);
      }}
      className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs", mine ? "bg-white/15 hover:bg-white/25" : "bg-slate-100 hover:bg-slate-200")}
    >
      <Download className="size-3.5 shrink-0" />
      <span className="truncate">{name}</span>
      <span className="ml-auto shrink-0 opacity-70">{formatBytes(size)}</span>
    </button>
  );
}

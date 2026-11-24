"use client";

import { Check, CheckCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/shared/use-action";
import { deleteNotificationAction, markAllNotificationsReadAction, markNotificationReadAction } from "@/actions/notifications";

export function NotificationRowActions({ id, read }: { id: string; read: boolean }) {
  const mark = useAction(markNotificationReadAction);
  const del = useAction(deleteNotificationAction);
  return (
    <div className="flex shrink-0 gap-1">
      {!read && (
        <Button size="icon-sm" variant="ghost" onClick={() => mark.run(id)} aria-label="Mark as read">
          <Check />
        </Button>
      )}
      <Button size="icon-sm" variant="ghost" onClick={() => del.run(id)} aria-label="Delete notification">
        <Trash2 />
      </Button>
    </div>
  );
}

export function MarkAllRead() {
  const { run, pending } = useAction(markAllNotificationsReadAction);
  return (
    <Button variant="outline" onClick={() => run()} loading={pending}>
      <CheckCheck /> Mark all read
    </Button>
  );
}

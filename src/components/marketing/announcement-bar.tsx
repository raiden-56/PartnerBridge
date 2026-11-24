import { Megaphone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { cn } from "@/lib/utils";

/** Shows active platform announcements created by admins. */
export async function AnnouncementBar({ audience }: { audience: "public" | "members" }) {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("announcements")
    .select("id, title, body, level")
    .in("audience", ["all", audience])
    .order("starts_at", { ascending: false })
    .limit(1);
  const a = data?.[0];
  if (!a) return null;
  const tone = a.level === "warning" ? "bg-amber-500" : a.level === "success" ? "bg-green-600" : "bg-navy-900";
  return (
    <div className={cn("px-4 py-2 text-center text-xs text-white sm:text-sm", tone)} role="status">
      <Megaphone className="mr-1.5 inline size-4 align-text-bottom" />
      <strong>{a.title}</strong> — {a.body}
    </div>
  );
}

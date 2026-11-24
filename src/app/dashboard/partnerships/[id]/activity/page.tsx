import { Activity, CheckSquare, FileSignature, FileText, Flag, Handshake, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/primitives";
import { EmptyState } from "@/components/shared/common";
import { getWorkspace } from "@/lib/queries/workspace";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

const ICONS: Record<string, typeof Activity> = { task: CheckSquare, milestone: Flag, document: FileText, agreement: FileSignature, deal: TrendingUp, request: Handshake, partnership: Handshake, application: Handshake };

export default async function WorkspaceActivity({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const supabase = await createClient();
  const { data } = await supabase.from("activity_logs").select("id, action, summary, created_at, actor_id, organization_id").eq("partnership_id", id).order("created_at", { ascending: false }).limit(200);
  const who = (uid: string | null) => ws.people.find((p) => p.id === uid)?.name ?? "System";
  const org = (oid: string | null) => (oid === ws.me.id ? ws.me.name : oid === ws.other.id ? ws.other.name : "");
  if (!data?.length) return <EmptyState icon={Activity} title="No activity yet" />;
  return (
    <Card>
      <CardContent className="pt-6">
        <ol className="relative space-y-6 border-l-2 border-slate-100 pl-6">
          {data.map((a) => {
            const Icon = ICONS[a.action.split(".")[0]!] ?? Activity;
            return (
              <li key={a.id} className="relative">
                <span className="absolute -left-[37px] flex size-7 items-center justify-center rounded-full border-2 border-white bg-blue-50 text-accent shadow-sm">
                  <Icon className="size-3.5" />
                </span>
                <p className="text-sm font-medium text-slate-900">{a.summary}</p>
                <p className="text-xs text-slate-500">
                  {who(a.actor_id)}
                  {org(a.organization_id) && ` · ${org(a.organization_id)}`} · {formatDate(a.created_at, "d MMM yyyy, HH:mm")}
                </p>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

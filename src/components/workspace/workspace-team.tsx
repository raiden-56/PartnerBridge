"use client";

import { Star, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Avatar } from "@/components/ui/overlays";
import { useAction } from "@/components/shared/use-action";
import { setWorkspaceMemberAction } from "@/actions/workspace";
import { ROLE_LABELS, type OrgRole } from "@/lib/auth/permissions";

interface P {
  id: string;
  orgId: string;
  role: string;
  name: string;
  avatar: string | null;
  designation: string | null;
  email: string;
  explicit: boolean;
  primary: boolean;
  autoAccess: boolean;
}

export function WorkspaceTeam({ pid, myOrgId, orgs, people, canManage }: { pid: string; myOrgId: string; orgs: { id: string; name: string }[]; people: P[]; canManage: boolean }) {
  const { run, pending } = useAction(setWorkspaceMemberAction);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {orgs.map((o) => {
        const mine = o.id === myOrgId;
        const list = people.filter((p) => p.orgId === o.id && (mine || p.explicit || p.autoAccess));
        return (
          <Card key={o.id}>
            <CardHeader>
              <CardTitle>{o.name}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {mine ? "Owners, admins and partnership managers always have access. Add members individually to give them access." : "People from your partner company with access to this workspace."}
              </p>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {list.map((p) => {
                  const hasAccess = p.autoAccess || p.explicit;
                  return (
                    <li key={p.id} className="flex items-center gap-3 py-3">
                      <Avatar src={p.avatar} name={p.name} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-900">
                          {p.name}
                          {p.primary && (
                            <Badge variant="warning">
                              <Star /> Primary contact
                            </Badge>
                          )}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {p.designation ?? p.email} · {ROLE_LABELS[p.role as OrgRole] ?? p.role}
                        </p>
                      </div>
                      {mine && canManage && (
                        <div className="flex shrink-0 gap-1">
                          {!p.primary && hasAccess && (
                            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(pid, p.id, "primary")} title="Make primary contact">
                              <Star />
                            </Button>
                          )}
                          {!p.autoAccess && !p.explicit && (
                            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(pid, p.id, "add")}>
                              <UserPlus /> Add
                            </Button>
                          )}
                          {!p.autoAccess && p.explicit && (
                            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(pid, p.id, "remove")} aria-label="Remove from workspace">
                              <UserMinus />
                            </Button>
                          )}
                        </div>
                      )}
                      {mine && !hasAccess && !canManage && <Badge variant="muted">No access</Badge>}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

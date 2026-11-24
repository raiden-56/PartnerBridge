"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Crown, LogOut, Mail, MoreHorizontal, Settings2, UserMinus, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, Field, Input, NativeSelect, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Avatar, Checkbox, ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlays";
import { useAction } from "@/components/shared/use-action";
import { inviteMemberAction, leaveCompanyAction, removeMemberAction, revokeInvitationAction, transferOwnershipAction, updateMemberAction } from "@/actions/team";
import { ROLE_LABELS, type OrgRole } from "@/lib/auth/permissions";
import { formatDate, timeAgo } from "@/lib/utils";

interface Member {
  id: string;
  userId: string;
  role: OrgRole;
  permissions: string[];
  joinedAt: string;
  name: string;
  email: string;
  avatar: string | null;
  designation: string | null;
  actions: number;
  lastActive: string | null;
}

function PermissionPicker({ grantable, value, onChange, role }: { grantable: { key: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; role: OrgRole }) {
  if (role === "admin") return <p className="text-xs text-muted-foreground">Admins have all permissions except ownership transfer and deletion.</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{role === "partnership_manager" ? "Partnership managers already handle requests, applications, workspaces, analytics and direct messages. Grant extra permissions:" : "Members only get the permissions you select:"}</p>
      {grantable.map((g) => (
        <label key={g.key} className="flex items-center gap-2 text-sm">
          <Checkbox checked={value.includes(g.key)} onCheckedChange={(c) => onChange(c ? [...value, g.key] : value.filter((x) => x !== g.key))} />
          {g.label}
        </label>
      ))}
    </div>
  );
}

export function TeamManager({
  myUserId,
  myRole,
  companyName,
  canManage,
  assignable,
  grantable,
  seatsLeft,
  members,
  invites,
}: {
  myUserId: string;
  myRole: OrgRole;
  companyName: string;
  canManage: boolean;
  assignable: OrgRole[];
  grantable: { key: string; label: string }[];
  seatsLeft: number;
  members: Member[];
  invites: { id: string; email: string; role: OrgRole; created_at: string; expires_at: string }[];
}) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteRole, setInviteRole] = React.useState<OrgRole>("member");
  const [invitePerms, setInvitePerms] = React.useState<string[]>(["workspaces.all"]);
  const [editing, setEditing] = React.useState<Member | null>(null);
  const [editRole, setEditRole] = React.useState<OrgRole>("member");
  const [editPerms, setEditPerms] = React.useState<string[]>([]);
  const [transferTo, setTransferTo] = React.useState<Member | null>(null);
  const [confirmName, setConfirmName] = React.useState("");
  const invite = useAction(inviteMemberAction);
  const update = useAction(updateMemberAction);
  const remove = useAction(removeMemberAction);
  const revoke = useAction(revokeInvitationAction);
  const transfer = useAction(transferOwnershipAction);
  const leave = useAction(leaveCompanyAction, { refresh: false });

  return (
    <>
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        {myRole !== "owner" && (
          <ConfirmDialog
            trigger={
              <Button variant="outline">
                <LogOut /> Leave company
              </Button>
            }
            title={`Leave ${companyName}?`}
            description="You'll lose access to this company's workspaces and data."
            confirmLabel="Leave"
            onConfirm={async () => {
              const r = await leave.run();
              if (r.ok) router.push("/dashboard");
            }}
          />
        )}
        {canManage && (
          <Button variant="accent" onClick={() => setInviteOpen(true)} disabled={seatsLeft <= 0} title={seatsLeft <= 0 ? "Seat limit reached — upgrade to add members" : undefined}>
            <UserPlus /> Invite member
          </Button>
        )}
      </div>

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Member</TH>
              <TH>Role</TH>
              <TH className="hidden md:table-cell">Activity</TH>
              <TH className="hidden md:table-cell">Joined</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {members.map((m) => {
              const manageable = canManage && m.role !== "owner" && m.userId !== myUserId && !(myRole === "admin" && m.role === "admin");
              return (
                <TR key={m.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar src={m.avatar} name={m.name} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">
                          {m.name} {m.userId === myUserId && <span className="text-xs font-normal text-slate-400">(you)</span>}
                        </p>
                        <p className="truncate text-xs text-slate-500">{m.designation ? `${m.designation} · ` : ""}{m.email}</p>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <Badge variant={m.role === "owner" ? "warning" : m.role === "admin" ? "accent" : "outline"}>
                      {m.role === "owner" && <Crown />} {ROLE_LABELS[m.role]}
                    </Badge>
                    {m.permissions.length > 0 && <p className="mt-1 text-[11px] text-slate-500">+{m.permissions.length} permission{m.permissions.length > 1 ? "s" : ""}</p>}
                  </TD>
                  <TD className="hidden text-xs text-slate-500 md:table-cell">
                    {m.actions} actions{m.lastActive ? ` · last ${timeAgo(m.lastActive)}` : ""}
                  </TD>
                  <TD className="hidden text-xs text-slate-500 md:table-cell">{formatDate(m.joinedAt)}</TD>
                  <TD className="text-right">
                    {(manageable || (myRole === "owner" && m.userId !== myUserId)) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon-sm" variant="ghost" aria-label="Member actions">
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {manageable && (
                            <DropdownMenuItem
                              onSelect={() => {
                                setEditing(m);
                                setEditRole(m.role);
                                setEditPerms(m.permissions);
                              }}
                            >
                              <Settings2 /> Change role & permissions
                            </DropdownMenuItem>
                          )}
                          {myRole === "owner" && m.role !== "owner" && (
                            <DropdownMenuItem onSelect={() => setTransferTo(m)}>
                              <Crown /> Transfer ownership
                            </DropdownMenuItem>
                          )}
                          {manageable && (
                            <>
                              <DropdownMenuSeparator />
                              <ConfirmDialog
                                trigger={
                                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                                    <UserMinus /> Remove from company
                                  </DropdownMenuItem>
                                }
                                title={`Remove ${m.name}?`}
                                description="They will immediately lose access to your company and its partnership workspaces."
                                confirmLabel="Remove"
                                onConfirm={() => remove.run(m.id)}
                              />
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>

      {canManage && invites.length > 0 && (
        <Card className="mt-6">
          <div className="border-b border-border px-5 py-3 text-sm font-semibold">Pending invitations</div>
          <ul className="divide-y divide-border">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Mail className="size-4 text-slate-400" />
                <span className="flex-1 truncate">{i.email}</span>
                <Badge variant="outline">{ROLE_LABELS[i.role]}</Badge>
                <span className="hidden text-xs text-slate-500 sm:inline">expires {formatDate(i.expires_at)}</span>
                <Button size="icon-sm" variant="ghost" onClick={() => revoke.run(i.id)} aria-label="Revoke invitation">
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a team member</DialogTitle>
            <DialogDescription>They&apos;ll receive a secure link valid for 7 days. {seatsLeft < 999 && `${seatsLeft} seat(s) left.`}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const email = String(new FormData(e.currentTarget).get("email"));
              const r = await invite.run({ email, role: inviteRole, permissions: invitePerms });
              if (r.ok) setInviteOpen(false);
            }}
          >
            <Field label="Work email" error={invite.fieldErrors.email} required>
              <Input type="email" name="email" autoFocus />
            </Field>
            <Field label="Role">
              <NativeSelect value={inviteRole} onChange={(e) => setInviteRole(e.target.value as OrgRole)}>
                {assignable.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <PermissionPicker grantable={grantable} value={invitePerms} onChange={setInvitePerms} role={inviteRole} />
            <DialogFooter>
              <Button type="submit" loading={invite.pending}>
                Send invitation
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editing?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Role">
              <NativeSelect value={editRole} onChange={(e) => setEditRole(e.target.value as OrgRole)}>
                {assignable.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <PermissionPicker grantable={grantable} value={editPerms} onChange={setEditPerms} role={editRole} />
          </div>
          <DialogFooter>
            <Button
              loading={update.pending}
              onClick={async () => {
                const r = await update.run(editing!.id, { role: editRole, permissions: editPerms });
                if (r.ok) setEditing(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!transferTo} onOpenChange={(o) => !o && (setTransferTo(null), setConfirmName(""))}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Transfer ownership to {transferTo?.name}?</DialogTitle>
            <DialogDescription>
              They will become the owner with full control, including billing and deletion. You will become an admin. Type <strong>{companyName}</strong> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={companyName} />
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={confirmName !== companyName}
              loading={transfer.pending}
              onClick={async () => {
                const r = await transfer.run(transferTo!.id, confirmName);
                if (r.ok) setTransferTo(null);
              }}
            >
              Transfer ownership
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

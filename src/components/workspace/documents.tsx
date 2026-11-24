"use client";

import * as React from "react";
import { Download, FileText, History, Lock, MoreHorizontal, Trash2, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Card, Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlays";
import { EmptyState } from "@/components/shared/common";
import { useAction } from "@/components/shared/use-action";
import { deleteDocumentAction, documentDownloadUrlAction, updateDocumentAccessAction, uploadDocumentAction, uploadDocumentVersionAction } from "@/actions/workspace";
import { DOCUMENT_CATEGORIES } from "@/lib/validation/schemas";
import { cn, formatBytes, formatDate, timeAgo, titleCase } from "@/lib/utils";

export interface Doc {
  id: string;
  title: string;
  category: string;
  access_level: "shared" | "internal";
  current_version: number;
  file_name: string;
  size_bytes: number;
  owner_organization_id: string;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  versions: { version: number; file_name: string; size_bytes: number; change_note: string | null; created_at: string; uploaded_by: string | null }[];
  logs: { action: string; user_id: string | null; version: number | null; created_at: string }[];
}

export function Documents({ pid, docs, myOrgId, orgNames, people, readOnly }: { pid: string; docs: Doc[]; myOrgId: string; orgNames: Record<string, string>; people: Record<string, string>; readOnly?: boolean }) {
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [versionDoc, setVersionDoc] = React.useState<Doc | null>(null);
  const [historyDoc, setHistoryDoc] = React.useState<Doc | null>(null);
  const [cat, setCat] = React.useState<string>("all");
  const upload = useAction(uploadDocumentAction);
  const newVersion = useAction(uploadDocumentVersionAction);
  const access = useAction(updateDocumentAccessAction);
  const del = useAction(deleteDocumentAction);

  const download = async (doc: Doc, version?: number) => {
    const res = await documentDownloadUrlAction(pid, doc.id, version);
    if (res.ok && res.data) window.open(res.data.url, "_blank", "noopener");
    else if (!res.ok) toast.error(res.error);
  };
  const visible = docs.filter((d) => cat === "all" || d.category === cat);

  return (
    <>
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5">
          {["all", ...DOCUMENT_CATEGORIES].map((c) => (
            <button key={c} onClick={() => setCat(c)} className={cn("rounded-full border px-2.5 py-1 text-xs capitalize", cat === c ? "border-accent bg-blue-50 text-accent" : "border-border bg-card text-slate-600")}>
              {c} {c === "all" ? `(${docs.length})` : `(${docs.filter((d) => d.category === c).length})`}
            </button>
          ))}
        </div>
        {!readOnly && (
          <Button variant="accent" onClick={() => setUploadOpen(true)}>
            <Upload /> Upload document
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={FileText} title="No documents" description="Share proposals, price lists, brand assets and other files securely with your partner." />
      ) : (
        <Card className="divide-y divide-border">
          {visible.map((d) => {
            const mine = d.owner_organization_id === myOrgId;
            return (
              <div key={d.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <FileText className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate font-medium text-slate-900">{d.title}</p>
                      <Badge variant="outline" className="capitalize">
                        {d.category}
                      </Badge>
                      <Badge variant="muted">v{d.current_version}</Badge>
                      {d.access_level === "internal" ? (
                        <Badge variant="warning">
                          <Lock /> Internal
                        </Badge>
                      ) : (
                        <Badge variant="success">
                          <Users /> Shared
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {d.file_name} · {formatBytes(Number(d.size_bytes))} · {orgNames[d.owner_organization_id]} · updated {timeAgo(d.updated_at)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => download(d)}>
                    <Download /> Download
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon-sm" variant="ghost" aria-label="Document actions">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => setHistoryDoc(d)}>
                        <History /> Versions & activity
                      </DropdownMenuItem>
                      {mine && !readOnly && (
                        <>
                          <DropdownMenuItem onSelect={() => setVersionDoc(d)}>
                            <Upload /> Upload new version
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => access.run(pid, d.id, d.access_level === "shared" ? "internal" : "shared")}>
                            {d.access_level === "shared" ? <Lock /> : <Users />} {d.access_level === "shared" ? "Make internal only" : "Share with partner"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <ConfirmDialog
                            trigger={
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                                <Trash2 /> Delete
                              </DropdownMenuItem>
                            }
                            title="Delete this document?"
                            description="It will be removed for both companies. Version history is retained for audit purposes."
                            confirmLabel="Delete"
                            onConfirm={() => del.run(pid, d.id)}
                          />
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {/* Upload */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload document</DialogTitle>
            <DialogDescription>Files are stored privately and downloaded through short-lived secure links. Max 25 MB.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await upload.run(pid, new FormData(e.currentTarget));
              if (res.ok) setUploadOpen(false);
            }}
          >
            <Field label="File" required>
              <Input type="file" name="file" required />
            </Field>
            <Field label="Title" error={upload.fieldErrors.title} required>
              <Input name="title" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Category">
                <NativeSelect name="category" defaultValue="general">
                  {DOCUMENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {titleCase(c)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Access">
                <NativeSelect name="accessLevel" defaultValue="shared">
                  <option value="shared">Shared with partner</option>
                  <option value="internal">Internal (my company only)</option>
                </NativeSelect>
              </Field>
            </div>
            <DialogFooter>
              <Button type="submit" loading={upload.pending}>
                Upload
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* New version */}
      <Dialog open={!!versionDoc} onOpenChange={(o) => !o && setVersionDoc(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>New version of “{versionDoc?.title}”</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await newVersion.run(pid, versionDoc!.id, new FormData(e.currentTarget));
              if (res.ok) setVersionDoc(null);
            }}
          >
            <Field label="File" required>
              <Input type="file" name="file" required />
            </Field>
            <Field label="What changed?">
              <Textarea name="changeNote" rows={2} />
            </Field>
            <DialogFooter>
              <Button type="submit" loading={newVersion.pending}>
                Upload version
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* History */}
      <Dialog open={!!historyDoc} onOpenChange={(o) => !o && setHistoryDoc(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{historyDoc?.title}</DialogTitle>
            <DialogDescription>Version history and document activity log</DialogDescription>
          </DialogHeader>
          {historyDoc && (
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold">Versions</p>
                <ul className="space-y-2">
                  {historyDoc.versions.map((v) => (
                    <li key={v.version} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium">v{v.version}</span> · {formatDate(v.created_at)}
                        <span className="block truncate text-xs text-slate-500">{v.change_note ?? v.file_name}</span>
                      </span>
                      <Button size="icon-sm" variant="ghost" onClick={() => download(historyDoc, v.version)} aria-label={`Download version ${v.version}`}>
                        <Download />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">Activity & downloads</p>
                <ul className="max-h-72 space-y-1.5 overflow-y-auto text-xs text-slate-600">
                  {historyDoc.logs.map((l, i) => (
                    <li key={i}>
                      {formatDate(l.created_at, "d MMM, HH:mm")} — <span className="font-medium">{people[l.user_id ?? ""] ?? "Member"}</span> {l.action.replace("_", " ")}
                      {l.version ? ` (v${l.version})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

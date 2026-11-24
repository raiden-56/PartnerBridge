"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Circle, FileDown, FileSignature, History, Pencil, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Field, Input, Textarea } from "@/components/ui/primitives";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { EmptyState, StatusBadge } from "@/components/shared/common";
import { useAction } from "@/components/shared/use-action";
import { agreementFileUrlAction, approveAgreementAction, saveAgreementAction, setAgreementStatusAction } from "@/actions/workspace";
import { formatDate } from "@/lib/utils";

export interface Agreement {
  id: string;
  title: string;
  agreement_type: string;
  status: string;
  commercial_terms: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  renewal_date: string | null;
  current_version: number;
  file_name: string | null;
  approval_a_by: string | null;
  approval_a_at: string | null;
  approval_b_by: string | null;
  approval_b_at: string | null;
  versions: { version: number; change_note: string | null; created_at: string; file_name: string | null }[];
}

export function Agreements({
  pid,
  agreements,
  sideA,
  sideB,
  mySide,
  canManage,
  people,
  esign,
  readOnly,
}: {
  pid: string;
  agreements: Agreement[];
  sideA: string;
  sideB: string;
  mySide: "a" | "b";
  canManage: boolean;
  people: Record<string, string>;
  esign: { configured: boolean; provider: string | null };
  readOnly?: boolean;
}) {
  const [editing, setEditing] = React.useState<Agreement | "new" | null>(null);
  const save = useAction(saveAgreementAction);
  const approve = useAction(approveAgreementAction);
  const status = useAction(setAgreementStatusAction);
  const ag = editing === "new" ? null : editing;

  const openFile = async (id: string, version?: number) => {
    const res = await agreementFileUrlAction(pid, id, version);
    if (res.ok && res.data) window.open(res.data.url, "_blank", "noopener");
    else if (!res.ok) toast.error(res.error);
  };

  return (
    <>
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>
          Approvals here record each company&apos;s internal acceptance of an agreement version. They are <strong>not legally binding electronic signatures</strong>.
          {esign.configured ? ` E-signature provider: ${esign.provider}.` : " To collect legally valid signatures, connect an e-signature provider (see Integrations) or sign offline and upload the executed PDF."}
        </p>
      </div>
      <div className="mb-4 flex justify-end">
        {!readOnly && (
          <Button variant="accent" onClick={() => setEditing("new")}>
            <Plus /> New agreement record
          </Button>
        )}
      </div>
      {agreements.length === 0 ? (
        <EmptyState icon={FileSignature} title="No agreements yet" description="Record partnership terms, upload the agreement PDF and track approvals, effective dates and renewals." />
      ) : (
        <div className="space-y-4">
          {agreements.map((a) => {
            const myApproved = mySide === "a" ? !!a.approval_a_at : !!a.approval_b_at;
            const expiringSoon = a.expiration_date && new Date(a.expiration_date).getTime() - Date.now() < 30 * 86400_000 && new Date(a.expiration_date).getTime() > Date.now();
            return (
              <Card key={a.id}>
                <CardContent className="space-y-4 pt-5">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold text-slate-900">{a.title}</p>
                        <StatusBadge status={a.status} />
                        <span className="text-xs text-slate-500">v{a.current_version}</span>
                      </div>
                      <p className="text-sm text-slate-500">{a.agreement_type}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {a.file_name && (
                        <Button size="sm" variant="outline" onClick={() => openFile(a.id)}>
                          <FileDown /> PDF
                        </Button>
                      )}
                      {!readOnly && ["draft", "under_review"].includes(a.status) && (
                        <Button size="sm" variant="outline" onClick={() => setEditing(a)}>
                          <Pencil /> Edit (new version)
                        </Button>
                      )}
                      {!readOnly && canManage && ["draft", "under_review"].includes(a.status) && !myApproved && (
                        <ConfirmDialog
                          trigger={
                            <Button size="sm" variant="success">
                              <ShieldCheck /> Approve v{a.current_version}
                            </Button>
                          }
                          variant="success"
                          title={`Approve version ${a.current_version}?`}
                          description="This records your company's internal approval of this exact version. It is not a legal e-signature. Any later edit resets approvals."
                          confirmLabel="Record approval"
                          onConfirm={() => approve.run(pid, a.id)}
                        />
                      )}
                      {!readOnly && canManage && a.status === "approved" && (
                        <Button size="sm" variant="accent" onClick={() => status.run(pid, a.id, "active")}>
                          Mark active
                        </Button>
                      )}
                      {!readOnly && canManage && a.status === "active" && (
                        <ConfirmDialog
                          trigger={
                            <Button size="sm" variant="outline" className="text-destructive">
                              Terminate
                            </Button>
                          }
                          title="Mark agreement as terminated?"
                          confirmLabel="Terminate"
                          onConfirm={() => status.run(pid, a.id, "terminated")}
                        />
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 text-sm sm:grid-cols-3">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Effective</p>
                      <p className="font-medium">{formatDate(a.effective_date)}</p>
                    </div>
                    <div className={`rounded-lg p-3 ${expiringSoon ? "bg-amber-50" : "bg-slate-50"}`}>
                      <p className="text-xs text-slate-500">Expires</p>
                      <p className="font-medium">
                        {formatDate(a.expiration_date)} {expiringSoon && <span className="text-xs text-amber-700">· soon</span>}
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Renewal</p>
                      <p className="font-medium">{formatDate(a.renewal_date)}</p>
                    </div>
                  </div>

                  {a.commercial_terms && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Commercial terms</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{a.commercial_terms}</p>
                    </div>
                  )}

                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      { name: sideA, at: a.approval_a_at, by: a.approval_a_by },
                      { name: sideB, at: a.approval_b_at, by: a.approval_b_by },
                    ].map((s) => (
                      <div key={s.name} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
                        {s.at ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-slate-300" />}
                        <span className="font-medium">{s.name}</span>
                        <span className="ml-auto text-xs text-slate-500">{s.at ? `Approved by ${people[s.by ?? ""] ?? "member"} · ${formatDate(s.at)}` : "Awaiting approval"}</span>
                      </div>
                    ))}
                  </div>

                  {a.versions.length > 1 && (
                    <details className="text-sm">
                      <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-accent">
                        <History className="size-3.5" /> Version history ({a.versions.length})
                      </summary>
                      <ul className="mt-2 space-y-1.5">
                        {a.versions.map((v) => (
                          <li key={v.version} className="flex items-center gap-2 text-xs text-slate-600">
                            v{v.version} · {formatDate(v.created_at)} — {v.change_note ?? "No note"}
                            {v.file_name && (
                              <button className="text-accent hover:underline" onClick={() => openFile(a.id, v.version)}>
                                PDF
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{ag ? `Edit “${ag.title}”` : "New agreement record"}</DialogTitle>
            <DialogDescription>{ag ? "Saving creates a new version and resets both companies' approvals." : "Upload the agreement PDF (optional) and record the key commercial terms and dates."}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await save.run(pid, ag?.id ?? null, new FormData(e.currentTarget));
              if (res.ok) setEditing(null);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title" error={save.fieldErrors.title} required>
                <Input name="title" defaultValue={ag?.title} />
              </Field>
              <Field label="Agreement type" error={save.fieldErrors.agreementType} required>
                <Input name="agreementType" defaultValue={ag?.agreement_type ?? "Partnership agreement"} placeholder="e.g. Distribution agreement, NDA, MoU" />
              </Field>
            </div>
            <Field label="Commercial terms" error={save.fieldErrors.commercialTerms}>
              <Textarea name="commercialTerms" rows={5} defaultValue={ag?.commercial_terms ?? ""} placeholder="Margins, fees, payment terms, exclusivity, territory, SLAs…" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Effective date">
                <Input type="date" name="effectiveDate" defaultValue={ag?.effective_date ?? ""} />
              </Field>
              <Field label="Expiration date" error={save.fieldErrors.expirationDate}>
                <Input type="date" name="expirationDate" defaultValue={ag?.expiration_date ?? ""} />
              </Field>
              <Field label="Renewal date">
                <Input type="date" name="renewalDate" defaultValue={ag?.renewal_date ?? ""} />
              </Field>
            </div>
            <Field label="Agreement PDF" hint={ag?.file_name ? `Current file: ${ag.file_name}. Upload to replace.` : "PDF only, up to 25 MB"}>
              <Input type="file" name="file" accept="application/pdf" />
            </Field>
            {ag && (
              <Field label="Change note">
                <Input name="changeNote" placeholder="What changed in this version?" />
              </Field>
            )}
            <DialogFooter>
              <Button type="submit" loading={save.pending}>
                {ag ? "Save new version" : "Create agreement"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

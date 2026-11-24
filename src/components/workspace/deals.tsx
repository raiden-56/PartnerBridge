"use client";

import * as React from "react";
import { BadgeCheck, Info, Plus, Trash2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, Field, Input, NativeSelect, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui/primitives";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlays";
import { EmptyState, StatCard, StatusBadge } from "@/components/shared/common";
import { useAction } from "@/components/shared/use-action";
import { deleteDealAction, saveDealAction, verifyDealRevenueAction } from "@/actions/workspace";
import { formatCurrency, formatDate } from "@/lib/utils";

export interface Deal {
  id: string;
  title: string;
  customer_name: string;
  customer_company: string | null;
  customer_email: string | null;
  owner_organization_id: string;
  referral_source_organization_id: string | null;
  stage: "lead" | "qualified" | "proposal" | "negotiation" | "won" | "lost";
  expected_value: number;
  attributed_revenue: number | null;
  verified_revenue: number | null;
  verified_at: string | null;
  expected_close_date: string | null;
  notes: string | null;
  owner_user_id: string | null;
}

const STAGES = ["lead", "qualified", "proposal", "negotiation", "won", "lost"] as const;

export function Deals({ pid, deals, myOrgId, orgs, people, canManage, readOnly }: { pid: string; deals: Deal[]; myOrgId: string; orgs: { id: string; name: string }[]; people: Record<string, string>; canManage: boolean; readOnly?: boolean }) {
  const [editing, setEditing] = React.useState<Deal | "new" | null>(null);
  const [verifying, setVerifying] = React.useState<Deal | null>(null);
  const save = useAction(saveDealAction);
  const verify = useAction(verifyDealRevenueAction);
  const del = useAction(deleteDealAction);
  const d = editing === "new" ? null : editing;
  const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.name ?? "—";

  const open = deals.filter((x) => !["won", "lost"].includes(x.stage));
  const won = deals.filter((x) => x.stage === "won");
  const pipeline = open.reduce((s, x) => s + Number(x.expected_value), 0);
  const attributed = won.reduce((s, x) => s + Number(x.attributed_revenue ?? 0), 0);
  const verified = won.reduce((s, x) => s + Number(x.verified_revenue ?? 0), 0);
  const referrals = deals.filter((x) => x.referral_source_organization_id && x.referral_source_organization_id !== x.owner_organization_id).length;

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Estimated pipeline" value={formatCurrency(pipeline, "INR", true)} icon={TrendingUp} tone="amber" hint={`${open.length} open deals · expected value`} />
        <StatCard label="Attributed revenue" value={formatCurrency(attributed, "INR", true)} icon={TrendingUp} tone="violet" hint="Claimed by deal owners on won deals" />
        <StatCard label="Verified revenue" value={formatCurrency(verified, "INR", true)} icon={BadgeCheck} tone="green" hint="Confirmed by the partner company" />
        <StatCard label="Referrals" value={referrals} icon={TrendingUp} hint={`${won.length} won · ${deals.filter((x) => x.stage === "lost").length} lost`} />
      </div>
      <p className="mb-4 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" /> Estimated pipeline is a forecast, attributed revenue is self-reported by the deal owner, and verified revenue is confirmed by the other company. They are never mixed.
      </p>
      <div className="mb-4 flex justify-end">
        {!readOnly && (
          <Button variant="accent" onClick={() => setEditing("new")}>
            <Plus /> Register deal
          </Button>
        )}
      </div>
      {deals.length === 0 ? (
        <EmptyState icon={TrendingUp} title="No deals registered" description="Register shared leads and referrals to track pipeline and partnership revenue." />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Deal</TH>
                <TH>Stage</TH>
                <TH className="hidden md:table-cell">Owner</TH>
                <TH className="text-right">Expected</TH>
                <TH className="hidden text-right lg:table-cell">Attributed / Verified</TH>
                <TH className="hidden md:table-cell">Close</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {deals.map((x) => (
                <TR key={x.id} className="cursor-pointer" onClick={() => !readOnly && setEditing(x)}>
                  <TD>
                    <p className="font-medium text-slate-900">{x.title}</p>
                    <p className="text-xs text-slate-500">
                      {x.customer_company ?? x.customer_name}
                      {x.referral_source_organization_id && x.referral_source_organization_id !== x.owner_organization_id && <Badge variant="violet" className="ml-1.5">Referral from {orgName(x.referral_source_organization_id)}</Badge>}
                    </p>
                  </TD>
                  <TD>
                    <StatusBadge status={x.stage} />
                  </TD>
                  <TD className="hidden md:table-cell">
                    <p className="text-sm">{orgName(x.owner_organization_id)}</p>
                    <p className="text-xs text-slate-500">{people[x.owner_user_id ?? ""] ?? ""}</p>
                  </TD>
                  <TD className="text-right tabular-nums">{formatCurrency(x.expected_value)}</TD>
                  <TD className="hidden text-right tabular-nums lg:table-cell">
                    <span className="text-slate-600">{x.attributed_revenue != null ? formatCurrency(x.attributed_revenue) : "—"}</span>
                    <span className="mx-1 text-slate-300">/</span>
                    {x.verified_revenue != null ? (
                      <span className="font-medium text-success">{formatCurrency(x.verified_revenue)}</span>
                    ) : x.stage === "won" && x.owner_organization_id !== myOrgId && canManage && !readOnly ? (
                      <button
                        className="text-xs font-medium text-accent hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setVerifying(x);
                        }}
                      >
                        Verify
                      </button>
                    ) : (
                      <span className="text-slate-400">unverified</span>
                    )}
                  </TD>
                  <TD className="hidden md:table-cell">{formatDate(x.expected_close_date)}</TD>
                  <TD onClick={(e) => e.stopPropagation()}>
                    {x.owner_organization_id === myOrgId && !readOnly && (
                      <ConfirmDialog
                        trigger={
                          <Button size="icon-sm" variant="ghost" aria-label="Delete deal">
                            <Trash2 />
                          </Button>
                        }
                        title="Delete this deal?"
                        confirmLabel="Delete"
                        onConfirm={() => del.run(pid, x.id)}
                      />
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{d ? "Edit deal" : "Register a deal"}</DialogTitle>
            <DialogDescription>Customer details are visible only to both partner companies.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const res = await save.run(pid, d?.id ?? null, Object.fromEntries(fd.entries()));
              if (res.ok) setEditing(null);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Deal title" error={save.fieldErrors.title} required className="sm:col-span-2">
                <Input name="title" defaultValue={d?.title} />
              </Field>
              <Field label="Customer name" error={save.fieldErrors.customerName} required>
                <Input name="customerName" defaultValue={d?.customer_name} />
              </Field>
              <Field label="Customer company">
                <Input name="customerCompany" defaultValue={d?.customer_company ?? ""} />
              </Field>
              <Field label="Customer email" error={save.fieldErrors.customerEmail}>
                <Input type="email" name="customerEmail" defaultValue={d?.customer_email ?? ""} />
              </Field>
              <Field label="Stage">
                <NativeSelect name="stage" defaultValue={d?.stage ?? "lead"}>
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s[0]!.toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Deal owner (company)">
                <NativeSelect name="ownerOrganizationId" defaultValue={d?.owner_organization_id ?? myOrgId}>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Referral source">
                <NativeSelect name="referralSourceOrganizationId" defaultValue={d?.referral_source_organization_id ?? ""}>
                  <option value="">Not a referral</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      Referred by {o.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Expected value (₹)" error={save.fieldErrors.expectedValue} required>
                <Input type="number" min={0} step="1" name="expectedValue" defaultValue={d?.expected_value ?? 0} />
              </Field>
              <Field label="Attributed revenue (₹)" hint="Your claimed revenue once won" error={save.fieldErrors.attributedRevenue}>
                <Input type="number" min={0} step="1" name="attributedRevenue" defaultValue={d?.attributed_revenue ?? ""} disabled={!!d?.verified_at} />
              </Field>
              <Field label="Expected closing date">
                <Input type="date" name="expectedCloseDate" defaultValue={d?.expected_close_date ?? ""} />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea name="notes" rows={3} defaultValue={d?.notes ?? ""} />
            </Field>
            <DialogFooter>
              <Button type="submit" loading={save.pending}>
                {d ? "Save deal" : "Register deal"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!verifying} onOpenChange={(o) => !o && setVerifying(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Verify revenue</DialogTitle>
            <DialogDescription>Confirm the actual revenue realised for “{verifying?.title}”. Only the partner company (not the deal owner) can verify.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const amount = Number(new FormData(e.currentTarget).get("amount"));
              const res = await verify.run(pid, verifying!.id, amount);
              if (res.ok) setVerifying(null);
            }}
          >
            <Field label="Verified revenue (₹)">
              <Input type="number" min={0} name="amount" defaultValue={verifying?.attributed_revenue ?? ""} required />
            </Field>
            <DialogFooter>
              <Button type="submit" variant="success" loading={verify.pending}>
                Confirm revenue
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

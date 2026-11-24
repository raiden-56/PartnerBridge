import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { requireOrg, AuthError } from "@/lib/auth/session";

export const runtime = "nodejs";

/** Generates a simple invoice PDF for a paid payment (RLS: billing managers of the company only). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireOrg("billing.manage");
    const { id } = await params;
    const supabase = await createClient();
    const { data: p } = await supabase
      .from("payments")
      .select("id, organization_id, amount, currency, status, invoice_number, provider_payment_id, paid_at, billing_cycle, plan:subscription_plans(name)")
      .eq("id", id)
      .maybeSingle();
    if (!p || p.organization_id !== ctx.orgId || p.status !== "paid") return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    const [{ data: org }, { data: contact }] = await Promise.all([
      supabase.from("organizations").select("name, city, country").eq("id", ctx.orgId).single(),
      supabase.from("organization_contacts").select("email, address").eq("organization_id", ctx.orgId).maybeSingle(),
    ]);

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const t = (s: string, x: number, y: number, size = 10, f = font) => page.drawText(s.replace(/[^\x20-\x7E]/g, "?"), { x, y, size, font: f, color: rgb(0.1, 0.12, 0.2) });
    page.drawRectangle({ x: 0, y: 780, width: 595, height: 62, color: rgb(0.09, 0.15, 0.33) });
    page.drawText("PartnerBridge", { x: 40, y: 805, size: 20, font: bold, color: rgb(1, 1, 1) });
    page.drawText("INVOICE", { x: 470, y: 805, size: 16, font: bold, color: rgb(1, 1, 1) });
    t(`Invoice no: ${p.invoice_number}`, 40, 740, 11, bold);
    t(`Date: ${format(new Date(p.paid_at!), "d MMM yyyy")}`, 40, 722);
    t(`Payment ref: ${p.provider_payment_id ?? "-"}`, 40, 706);
    t("Billed to", 360, 740, 11, bold);
    t(org?.name ?? "", 360, 722);
    t([org?.city, org?.country].filter(Boolean).join(", "), 360, 706);
    if (contact?.email) t(contact.email, 360, 690);
    page.drawRectangle({ x: 40, y: 630, width: 515, height: 24, color: rgb(0.95, 0.96, 0.98) });
    t("Description", 50, 638, 10, bold);
    t("Amount", 470, 638, 10, bold);
    const planName = (p.plan as unknown as { name: string } | null)?.name ?? "Subscription";
    t(`${planName} plan - ${p.billing_cycle} subscription`, 50, 610);
    t(`${p.currency} ${Number(p.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 470, 610);
    page.drawLine({ start: { x: 40, y: 590 }, end: { x: 555, y: 590 }, thickness: 0.5, color: rgb(0.8, 0.82, 0.86) });
    t("Total paid", 360, 570, 11, bold);
    t(`${p.currency} ${Number(p.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 470, 570, 11, bold);
    t("This is a system-generated receipt. GST details will appear here once the platform's GSTIN is configured.", 40, 80, 8);
    const bytes = await pdf.save();
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${p.invoice_number}.pdf"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Invoice unavailable" }, { status: 500 });
  }
}

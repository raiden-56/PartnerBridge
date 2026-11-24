import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { format } from "date-fns";
import { requireOrg, AuthError } from "@/lib/auth/session";
import { computeAnalytics, parseFilters } from "@/lib/analytics/queries";
import { hasFeature } from "@/lib/billing/entitlements";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireOrg("analytics.view");
    if (!(await hasFeature(ctx.orgId, "exports"))) return NextResponse.json({ error: "Exports require the Business plan" }, { status: 402 });
    const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
    const fmt = sp.format ?? "csv";
    const filters = parseFilters(sp);
    const data = await computeAnalytics(ctx.orgId, filters);
    const supabase = await createClient();
    const { data: org } = await supabase.from("organizations").select("name").eq("id", ctx.orgId).single();
    const range = `${format(filters.from, "d MMM yyyy")} – ${format(filters.to, "d MMM yyyy")}`;
    const fileBase = `partnerbridge-analytics-${format(new Date(), "yyyyMMdd")}`;

    const kpiRows: [string, string | number][] = [
      ["Total partnership requests", data.kpis.totalRequests],
      ["Incoming requests", data.kpis.incomingRequests],
      ["Outgoing requests", data.kpis.outgoingRequests],
      ["Active partnerships", data.kpis.activePartnerships],
      ["Pending approvals", data.kpis.pendingApprovals],
      ["Active opportunities", data.kpis.activeOpportunities],
      ["Deals generated", data.kpis.dealsGenerated],
      ["Referrals received", data.kpis.referralsReceived],
      ["Completed milestones", data.kpis.completedMilestones],
      ["Estimated pipeline value (INR, forecast)", data.kpis.estimatedPipeline],
      ["Attributed revenue (INR, self-reported)", data.kpis.attributedRevenue],
      ["Verified revenue (INR, partner-confirmed)", data.kpis.verifiedRevenue],
    ];
    const perfHeader = ["Partner", "Type", "Status", "Deals", "Pipeline (est.)", "Attributed", "Verified", "Task completion %", "Milestones"];
    const perfRows = data.performance.map((p) => [p.partner, p.category, p.status, p.deals, p.pipeline, p.attributed, p.verified, p.taskCompletion, p.milestonesDone]);
    const monthlyHeader = ["Month", "Requests sent", "Requests received", "Accepted", "Referrals received", "Referrals sent", "New partnerships"];
    const monthlyRows = data.charts.requestsVsAcceptances.map((r, i) => [r.month, r.sent, r.received, r.accepted, data.charts.monthlyReferrals[i]?.received ?? 0, data.charts.monthlyReferrals[i]?.sent ?? 0, data.charts.partnershipsOverTime[i]?.new ?? 0]);

    if (fmt === "csv") {
      const lines = [
        `PartnerBridge analytics — ${org?.name ?? ""}`,
        `Period,${csvEscape(range)}`,
        "",
        "KPI,Value",
        ...kpiRows.map((r) => r.map(csvEscape).join(",")),
        "",
        perfHeader.join(","),
        ...perfRows.map((r) => r.map(csvEscape).join(",")),
        "",
        monthlyHeader.join(","),
        ...monthlyRows.map((r) => r.map(csvEscape).join(",")),
      ];
      return new NextResponse("﻿" + lines.join("\n"), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${fileBase}.csv"`, "Cache-Control": "no-store" },
      });
    }

    if (fmt === "xlsx") {
      const wb = new ExcelJS.Workbook();
      wb.creator = "PartnerBridge";
      const add = (name: string, header: string[], rows: (string | number)[][]) => {
        const ws = wb.addWorksheet(name);
        ws.addRow(header).font = { bold: true };
        rows.forEach((r) => ws.addRow(r));
        ws.columns.forEach((c) => (c.width = 22));
      };
      add("KPIs", ["KPI", "Value"], kpiRows);
      add("Partner performance", perfHeader, perfRows);
      add("Monthly", monthlyHeader, monthlyRows);
      add(
        "Deals",
        ["Title", "Stage", "Expected value", "Attributed revenue", "Verified revenue", "Created"],
        data.deals.map((d) => [d.title, d.stage, Number(d.expected_value), Number(d.attributed_revenue ?? 0), Number(d.verified_revenue ?? 0), format(new Date(d.created_at), "yyyy-MM-dd")]),
      );
      const buf = await wb.xlsx.writeBuffer();
      return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (fmt === "pdf") {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      let page = pdf.addPage([595, 842]);
      let y = 800;
      const ascii = (s: string) => s.replace(/[^\x20-\x7E]/g, (c) => (c === "–" ? "-" : c === "×" ? "x" : "?"));
      const text = (s: string, x: number, size = 10, f = font, color = rgb(0.1, 0.12, 0.2)) => page.drawText(ascii(s), { x, y, size, font: f, color });
      const nl = (h = 16) => {
        y -= h;
        if (y < 50) {
          page = pdf.addPage([595, 842]);
          y = 800;
        }
      };
      page.drawRectangle({ x: 0, y: 812, width: 595, height: 30, color: rgb(0.09, 0.15, 0.33) });
      page.drawText("PartnerBridge - Partnership Analytics", { x: 40, y: 822, size: 13, font: bold, color: rgb(1, 1, 1) });
      y = 790;
      text(`${org?.name ?? ""}  |  ${range}`, 40, 11, bold);
      nl(26);
      text("Key metrics", 40, 12, bold);
      nl(18);
      for (const [k, v] of kpiRows) {
        text(k, 40);
        text(String(typeof v === "number" ? v.toLocaleString("en-IN") : v), 400, 10, bold);
        nl();
      }
      nl(10);
      text("Partner performance", 40, 12, bold);
      nl(18);
      const cols = [40, 190, 270, 320, 390, 460, 520];
      ["Partner", "Status", "Deals", "Pipeline", "Attributed", "Verified", "Tasks"].forEach((h, i) => text(h, cols[i]!, 9, bold));
      nl();
      for (const p of data.performance) {
        [p.partner.slice(0, 26), p.status, String(p.deals), p.pipeline.toLocaleString("en-IN"), p.attributed.toLocaleString("en-IN"), p.verified.toLocaleString("en-IN"), `${p.taskCompletion}%`].forEach((v, i) => text(v, cols[i]!, 9));
        nl(14);
      }
      nl(10);
      text("Estimated pipeline is a forecast; attributed revenue is self-reported; verified revenue is confirmed by the partner.", 40, 8, font, rgb(0.4, 0.45, 0.5));
      nl(12);
      text(`Generated ${format(new Date(), "d MMM yyyy HH:mm")}`, 40, 8, font, rgb(0.4, 0.45, 0.5));
      const bytes = await pdf.save();
      return new NextResponse(new Uint8Array(bytes), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileBase}.pdf"`, "Cache-Control": "no-store" },
      });
    }
    return NextResponse.json({ error: "Unknown format" }, { status: 400 });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[export]", e);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}

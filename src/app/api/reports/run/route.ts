import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { getRolePermissions, saleVisibilityWhere } from "@/lib/permissions";
import { requireReport } from "@/lib/plan-gating";
import { REPORTS, POINT_IN_TIME, isReportKey, type ReportResult } from "@/lib/reports/registry";
import { buildContext, todayPH } from "@/lib/reports/context";
import { RUNNERS } from "@/lib/reports/run";

const isDate = (v: string | null): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

// Runs one report: ?report=&from=&to=&branch=current|all|<storeId>&format=json|xlsx|csv
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const p = await getRolePermissions(session.tenantId, session.role);
  if (!p.reports) return NextResponse.json({ error: "You don't have access to Reports." }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const key = params.get("report");
  if (!isReportKey(key)) return NextResponse.json({ error: "Unknown report." }, { status: 400 });
  const gate = await requireReport(session.tenantId, key);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (key === "payables-aging" && !p.suppliers_pay) return NextResponse.json({ error: "You don't have access to supplier payables." }, { status: 403 });

  // Dates are Philippine calendar days; default is this month so far.
  const today = todayPH();
  const toKey = isDate(params.get("to")) ? params.get("to")! : today;
  const fromKey = isDate(params.get("from")) ? params.get("from")! : `${today.slice(0, 8)}01`;
  if (fromKey > toKey) return NextResponse.json({ error: "The start date is after the end date." }, { status: 400 });
  if (Date.parse(toKey) - Date.parse(fromKey) > 731 * 86400000) return NextResponse.json({ error: "Choose a range of up to 2 years." }, { status: 400 });

  // Branch: users who see all branches may pick any branch or all of them; others get their own.
  const stores = await prisma.store.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true, isActive: true } });
  const branch = params.get("branch") ?? "current";
  let storeIds: string[] | null;
  if (p.all_branches && branch === "all") storeIds = stores.length > 1 ? null : stores.map((s) => s.id);
  else if (p.all_branches && stores.some((s) => s.id === branch)) storeIds = [branch];
  else storeIds = session.storeId ? [session.storeId] : stores.map((s) => s.id);

  const meta = REPORTS.find((r) => r.key === key)!;
  if ("multiBranch" in meta && meta.multiBranch && stores.filter((s) => s.isActive).length < 2) {
    return NextResponse.json({ error: `${meta.label} needs more than one branch.` }, { status: 400 });
  }

  const ctx = await buildContext({ tenantId: session.tenantId, storeIds, fromKey, toKey, saleVisibility: await saleVisibilityWhere(session) });
  const result = await RUNNERS[key]({ ...ctx, canPay: p.suppliers_pay });
  const scope = storeIds === null ? "All branches" : storeIds.length === 1 ? stores.find((s) => s.id === storeIds![0])?.name ?? "" : `${storeIds.length} branches`;
  const period = POINT_IN_TIME.includes(key) ? `As of ${today}` : fromKey === toKey ? fromKey : `${fromKey} to ${toKey}`;

  const format = params.get("format");
  if (format === "xlsx" || format === "csv") {
    const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { name: true } });
    return exportFile(result, { key, title: meta.label, business: tenant?.name ?? "", scope, period, format, fileKey: `${key}-${fromKey}-to-${toKey}` });
  }
  return NextResponse.json({ ...result, meta: { key, label: meta.label, scope, period, fromKey, toKey } });
}

function exportFile(
  result: ReportResult,
  m: { key?: string; title: string; business: string; scope: string; period: string; format: "xlsx" | "csv"; fileKey: string }
) {
  const header = result.columns.map((c) => c.label || " ");
  const body = result.rows.map((r) =>
    result.columns.map((c) => {
      const v = r[c.key];
      if (v === null || v === undefined) return "";
      if ((c.format === "date" || c.format === "datetime") && typeof v === "string" && v.includes("T")) {
        const d = new Date(new Date(v).getTime() + 8 * 3600 * 1000).toISOString();
        return c.format === "date" ? d.slice(0, 10) : `${d.slice(0, 10)} ${d.slice(11, 16)}`;
      }
      return v;
    })
  );
  const hasTotals = result.columns.some((c) => c.total);
  const totals = hasTotals
    ? result.columns.map((c, i) => (i === 0 ? "Total" : c.total ? Math.round(result.rows.reduce((s, r) => s + Number(r[c.key] ?? 0), 0) * 100) / 100 : ""))
    : null;

  if (m.format === "csv") {
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header, ...body, ...(totals ? [totals] : [])].map((row) => row.map(esc).join(","));
    return new NextResponse("﻿" + lines.join("\r\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${m.fileKey}.csv"`, "Cache-Control": "no-store" },
    });
  }

  const top = [[m.title], [m.business], [`${m.scope} · ${m.period}`], [`Generated ${new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ")}`], []];
  const sheet = XLSX.utils.aoa_to_sheet([...top, header, ...body, ...(totals ? [totals] : [])]);
  // Money columns get thousands separators and two decimals.
  result.columns.forEach((c, ci) => {
    if (c.format !== "money" && c.format !== "pct" && c.format !== "qty") return;
    for (let r = top.length + 1; r <= top.length + body.length + (totals ? 1 : 0); r++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c: ci })];
      if (cell && typeof cell.v === "number") cell.z = c.format === "pct" ? "0.00" : "#,##0.00";
    }
  });
  sheet["!cols"] = result.columns.map((c) => ({ wch: Math.min(40, Math.max(10, c.label.length + 2, ...body.slice(0, 200).map((r) => String(r[result.columns.indexOf(c)] ?? "").length + 1))) }));
  const summary = XLSX.utils.aoa_to_sheet([[m.title], [`${m.scope} · ${m.period}`], [], ...result.summary.map((s) => [s.label, s.value]), ...(result.note ? [[], [result.note]] : [])]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, m.key === "overview" ? "Daily trend" : "Report");
  XLSX.utils.book_append_sheet(book, summary, "Summary");
  for (const sec of result.sections ?? []) {
    const aoa = [sec.columns.map((c) => c.label || " "), ...sec.rows.map((r) => sec.columns.map((c) => r[c.key] ?? ""))];
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(aoa), sec.title.slice(0, 31).replace(/[\/?*[\]:]/g, " "));
  }
  const buffer = XLSX.write(book, { bookType: "xlsx", type: "buffer" });
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${m.fileKey}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

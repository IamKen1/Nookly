import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireFeature } from "@/lib/plan-gating";
import { hasPermission } from "@/lib/permissions";
import { PRESCRIPTION_STATUS_LABELS, prescriptionWhere } from "@/lib/prescription-list";

const dayPH = (d: Date) => new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);

// The Prescriptions list as an Excel file, with the same filters as the screen.
// One row per prescribed item, so quantities can be totaled in Excel.
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "prescriptions"))) {
    return NextResponse.json({ error: "You don't have access to Prescriptions." }, { status: 403 });
  }
  const gate = await requireFeature(session.tenantId, "prescriptions");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const prescriptions = await prisma.prescription.findMany({
    where: prescriptionWhere(session.tenantId, new URL(request.url).searchParams),
    include: {
      customer: { select: { firstName: true, lastName: true, phone: true } },
      doctor: { select: { firstName: true, lastName: true, licenseNumber: true } },
      items: { include: { product: { select: { name: true } } } },
    },
    orderBy: [{ originalDate: "desc" }, { createdAt: "desc" }],
    take: 5000,
  });

  const rows = prescriptions.flatMap((p) =>
    p.items.map((i) => ({
      "Rx #": p.prescriptionNumber,
      Date: dayPH(p.originalDate),
      Customer: `${p.customer.firstName} ${p.customer.lastName}`.trim(),
      Phone: p.customer.phone ?? "",
      Doctor: `Dr. ${p.doctor.firstName} ${p.doctor.lastName}`.trim(),
      "License #": p.doctor.licenseNumber ?? "",
      Item: i.product.name,
      Prescribed: i.quantity,
      Served: i.servedQuantity,
      Remaining: Math.max(0, i.quantity - i.servedQuantity),
      Status: PRESCRIPTION_STATUS_LABELS[p.status] ?? p.status,
      Instructions: p.instructions ?? "",
    }))
  );

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "Rx #": "No prescriptions match these filters." }]);
  sheet["!cols"] = [12, 11, 24, 14, 24, 12, 30, 10, 8, 10, 16, 30].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, sheet, "Prescriptions");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="prescriptions-${dayPH(new Date())}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

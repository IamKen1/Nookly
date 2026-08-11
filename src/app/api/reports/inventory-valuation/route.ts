import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { requireFeature } from "@/lib/plan-gating";

const formatCurrency = (value: number) => Number(value.toFixed(2));

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireFeature(session.tenantId, "reports");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const products = await prisma.product.findMany({
      where: { tenantId: session.tenantId, isActive: true },
      include: {
        category: true,
        stocks: session.storeId ? { where: { storeId: session.storeId } } : true,
      },
      orderBy: { name: "asc" },
    });

    const rows = products.map((product) => {
      const costPrice = Number(product.costPrice ?? 0);
      const sellingPrice = Number(product.sellingPrice ?? 0);
      const quantity = product.stocks[0]?.currentStock ?? 0;
      return {
        Product: product.name,
        "Generic Name": product.genericName ?? "",
        Category: product.category?.name ?? "",
        Barcode: product.barcode ?? "",
        "Current Stock": quantity,
        "Cost Price": formatCurrency(costPrice),
        "Selling Price": formatCurrency(sellingPrice),
        "Cost Value": formatCurrency(quantity * costPrice),
        "Retail Value": formatCurrency(quantity * sellingPrice),
        "Minimum Stock": product.minimumStock,
        "Reorder Point": product.reorderPoint,
      };
    });

    const totalCostValue = rows.reduce((sum, row) => sum + row["Cost Value"], 0);
    const totalRetailValue = rows.reduce((sum, row) => sum + row["Retail Value"], 0);

    const workbook = XLSX.utils.book_new();
    const summarySheet = XLSX.utils.json_to_sheet([
      {
        GeneratedAt: new Date().toISOString(),
        Products: rows.length,
        "Total Cost Value": formatCurrency(totalCostValue),
        "Total Retail Value": formatCurrency(totalRetailValue),
      },
    ]);
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Inventory Valuation");

    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    const fileName = `inventory-valuation-${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error exporting inventory valuation:", error);
    return NextResponse.json({ error: "Failed to export inventory valuation" }, { status: 500 });
  }
}

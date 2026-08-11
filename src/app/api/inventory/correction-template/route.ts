import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });

  try {
    const products = await prisma.product.findMany({
      where: { tenantId: session.tenantId, isActive: true },
      include: {
        category: true,
        stocks: { where: { storeId: session.storeId } },
      },
      orderBy: { name: "asc" },
    });

    const correctionData = products.map((product) => ({
      "Product ID": product.id,
      "Product Name": product.name,
      Barcode: product.barcode || "",
      Category: product.category?.name || "",
      "System Stock": product.stocks[0]?.currentStock ?? 0,
      "Actual Count": "",
      Difference: "",
      Notes: "",
    }));

    const workbook = XLSX.utils.book_new();
    const correctionWorksheet = XLSX.utils.json_to_sheet(correctionData);
    correctionWorksheet["!cols"] = [
      { wch: 15 },
      { wch: 35 },
      { wch: 15 },
      { wch: 20 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 30 },
    ];

    for (let i = 0; i < products.length; i++) {
      const rowNum = i + 2;
      correctionWorksheet[`G${rowNum}`] = { t: "n", f: `F${rowNum}-E${rowNum}` };
    }

    XLSX.utils.book_append_sheet(workbook, correctionWorksheet, "Stock Correction");

    const instructionsWorksheet = XLSX.utils.json_to_sheet([
      { Step: "1", Action: "Physical Count", Description: 'Count actual stock for each product and enter in "Actual Count" column' },
      { Step: "2", Action: "Review Differences", Description: '"Difference" column: positive = overage, negative = shortage' },
      { Step: "3", Action: "Add Notes", Description: 'Explain significant differences in the "Notes" column' },
      { Step: "4", Action: "Save & Upload", Description: "Save file and upload through Inventory > Import > Stock Correction mode" },
      { Step: "5", Action: "System Updates", Description: "System updates stock levels and creates adjustment records" },
    ]);
    instructionsWorksheet["!cols"] = [{ wch: 8 }, { wch: 20 }, { wch: 70 }];
    XLSX.utils.book_append_sheet(workbook, instructionsWorksheet, "Instructions");

    const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=inventory-correction-${new Date().toISOString().split("T")[0]}.xlsx`,
      },
    });
  } catch (error) {
    console.error("Correction template error:", error);
    return NextResponse.json({ error: "Failed to generate correction template" }, { status: 500 });
  }
}

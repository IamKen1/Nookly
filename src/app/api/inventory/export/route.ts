import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";

const formatNumber = (value: number) => Number(value.toFixed(2));

const calculateMarkupPercentage = (costPrice: number, sellingPrice: number) => {
  if (costPrice <= 0) return 0;
  return formatNumber(((sellingPrice - costPrice) / costPrice) * 100);
};

const calculateSuggestedSellingPrice = (costPrice: number, markup: number) => {
  if (costPrice <= 0) return 0;
  return formatNumber(costPrice * (1 + markup / 100));
};

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const products = await prisma.product.findMany({
      where: { tenantId: session.tenantId },
      include: {
        category: true,
        stocks: session.storeId ? { where: { storeId: session.storeId } } : true,
      },
      orderBy: { name: "asc" },
    });

    const exportData = products.map((product) => {
      const currentStock = product.stocks[0]?.currentStock ?? 0;
      const costPrice = Number(product.costPrice || 0);
      const sellingPrice = Number(product.sellingPrice || 0);
      return {
        "Product ID": product.id,
        Classification: product.classification || "",
        "Product Name": product.name,
        "Generic Name": product.genericName || "",
        "Brand Name": product.brandName || "",
        Dosage: product.strength || "",
        "Dosage Form": product.dosageForm || "",
        "Net Weight": product.weight || "",
        Use: product.therapeuticUse || product.category?.name || "",
        Barcode: product.barcode || "",
        Description: product.description || "",
        Manufacturer: product.manufacturer || "",
        Category: product.category?.name || "",
        "Cost Price Per Box": Number(product.costPricePerBox || 0),
        "Cost Price": costPrice,
        "Cost Price Per Piece": costPrice,
        "Selling Price": sellingPrice,
        "Selling Price Per Piece": sellingPrice,
        "Markup %": calculateMarkupPercentage(costPrice, sellingPrice),
        "Selling Price @ 50%": calculateSuggestedSellingPrice(costPrice, 50),
        "Selling Price @ 40%": calculateSuggestedSellingPrice(costPrice, 40),
        "Selling Price @ 20%": calculateSuggestedSellingPrice(costPrice, 20),
        "Selling Price @ 10%": calculateSuggestedSellingPrice(costPrice, 10),
        "Selling Price @ 25% (Branded)": calculateSuggestedSellingPrice(costPrice, 25),
        "Current Stock": currentStock,
        "Minimum Stock": product.minimumStock || 0,
        "Maximum Stock": product.maximumStock || 0,
        "Reorder Point": product.reorderPoint || 0,
        "Drug Schedule": product.drugSchedule || "UNSCHEDULED",
        "Requires Prescription": product.requiresPrescription ? "Yes" : "No",
        "Is OTC": product.isOTC ? "Yes" : "No",
        "Is VATable": product.isVatable ? "Yes" : "No",
        "Is Active": product.isActive ? "Yes" : "No",
        "Created At": product.createdAt.toISOString(),
        "Updated At": product.updatedAt.toISOString(),
      };
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    worksheet["!cols"] = Object.keys(exportData[0] ?? {}).map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory Export");

    const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=inventory-export-${new Date().toISOString().split("T")[0]}.xlsx`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Failed to export inventory" }, { status: 500 });
  }
}

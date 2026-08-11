import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";

const PHARMA_TEMPLATE_COLUMNS = [
  "CLASSIFICATION",
  "GENERIC NAME",
  "BRAND NAME",
  "BARCODE",
  "DOSAGE",
  "DOSAGE FORM",
  "NET WEIGHT",
  "USE",
  "MANUFACTURER",
  "COST PRICE PER BOX",
  "COST PRICE PER PIECE",
  "SELLING PRICE PER PIECE",
  "Current Stock",
  "Minimum Stock",
  "Maximum Stock",
  "Reorder Point",
  "Drug Schedule",
  "Requires Prescription",
  "Is OTC",
  "Is VATable",
  "Is Active",
] as const;

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const categories = await prisma.category.findMany({
      where: { tenantId: session.tenantId, isActive: true },
      orderBy: { name: "asc" },
    });

    const pharmaTemplateData = [
      {
        CLASSIFICATION: "GENERIC",
        "GENERIC NAME": "Acetylcysteine",
        "BRAND NAME": "Acetyphil",
        BARCODE: "1234567890123",
        DOSAGE: "600mg",
        "DOSAGE FORM": "POWDER SOLUTION",
        "NET WEIGHT": 10,
        USE: "MUCOLYTIC-COUGH",
        MANUFACTURER: "Sample Pharma Manufacturer",
        "COST PRICE PER BOX": 135,
        "COST PRICE PER PIECE": 13.5,
        "SELLING PRICE PER PIECE": 30,
        "Current Stock": 50,
        "Minimum Stock": 10,
        "Maximum Stock": 500,
        "Reorder Point": 20,
        "Drug Schedule": "UNSCHEDULED (Optional)",
        "Requires Prescription": "No (Yes/No)",
        "Is OTC": "Yes (Yes/No)",
        "Is VATable": "Yes (Yes/No)",
        "Is Active": "Yes (Yes/No)",
      },
    ];

    const standardTemplateData = [
      {
        "Product Name": "Sample Product Name",
        "Generic Name": "Sample Generic Name (Optional)",
        "Brand Name": "Sample Brand Name (Optional)",
        Barcode: "1234567890123",
        Description: "Product description (Optional)",
        Strength: "500mg (Optional)",
        "Dosage Form": "Tablet (Optional)",
        Manufacturer: "Sample Manufacturer (Optional)",
        Category: "Select from: " + categories.map((c) => c.name).join(", "),
        "Cost Price": 100.0,
        "Cost Price Per Box": 1000.0,
        "Selling Price": 150.0,
        "Current Stock": 50,
        "Minimum Stock": 10,
        "Maximum Stock": 500,
        "Reorder Point": 20,
        "Drug Schedule": "UNSCHEDULED (Options: UNSCHEDULED, SCHEDULE_I..V)",
        "Requires Prescription": "No (Yes/No)",
        "Is OTC": "Yes (Yes/No)",
        "Is VATable": "Yes (Yes/No)",
        "Is Active": "Yes (Yes/No)",
      },
    ];

    const workbook = XLSX.utils.book_new();

    const pharmaTemplateWorksheet = XLSX.utils.json_to_sheet(pharmaTemplateData);
    pharmaTemplateWorksheet["!cols"] = PHARMA_TEMPLATE_COLUMNS.map(() => ({ wch: 24 }));

    const templateWorksheet = XLSX.utils.json_to_sheet(standardTemplateData);
    templateWorksheet["!cols"] = Object.keys(standardTemplateData[0]).map(() => ({ wch: 24 }));

    XLSX.utils.book_append_sheet(workbook, pharmaTemplateWorksheet, "Pharma Import Template");
    XLSX.utils.book_append_sheet(workbook, templateWorksheet, "Standard Import Template");

    const categoriesWorksheet = XLSX.utils.json_to_sheet(
      categories.map((category) => ({
        "Category ID": category.id,
        "Category Name": category.name,
        Description: category.description || "",
      }))
    );
    categoriesWorksheet["!cols"] = [{ wch: 15 }, { wch: 30 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(workbook, categoriesWorksheet, "Categories Reference");

    const instructionsWorksheet = XLSX.utils.json_to_sheet([
      { Field: "Product Name", Required: "Yes for standard template", Description: "Unique product name; auto-built from brand/generic in pharma sheet when blank" },
      { Field: "Category", Required: "Yes", Description: "Must match an existing category name exactly (auto-created from USE column in pharma sheet)" },
      { Field: "Cost Price / COST PRICE PER PIECE", Required: "Yes", Description: "Purchase cost per unit" },
      { Field: "Selling Price / SELLING PRICE PER PIECE", Required: "Yes", Description: "Retail selling price per unit" },
      { Field: "Barcode", Required: "No", Description: "Must be unique per tenant if provided" },
      { Field: "Current Stock", Required: "Yes", Description: "Initial inventory quantity for your assigned branch" },
      { Field: "Drug Schedule", Required: "No", Description: "Controlled substance schedule" },
      { Field: "Requires Prescription / Is OTC / Is VATable / Is Active", Required: "No", Description: "Yes/No flags" },
    ]);
    instructionsWorksheet["!cols"] = [{ wch: 30 }, { wch: 15 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(workbook, instructionsWorksheet, "Instructions");

    const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=inventory-import-template.xlsx",
      },
    });
  } catch (error) {
    console.error("Template generation error:", error);
    return NextResponse.json({ error: "Failed to generate template" }, { status: 500 });
  }
}

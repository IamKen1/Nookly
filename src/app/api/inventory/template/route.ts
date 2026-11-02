import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";

// The import template. One sheet to fill ("Products", headers only so no
// sample row can sneak into an import), with the four required columns first
// and marked *, the columns every store can use next, and the pharmacy-only
// columns last — a general-merchandise store just leaves those blank.
// The import matches headers loosely, so the "*" and "(hints)" are fine.
const COLUMNS: { header: string; required: boolean; what: string; example: string; width: number }[] = [
  { header: "Product Name *", required: true, what: "Name as it should appear in the POS and on receipts", example: "Biogesic 500mg Tablet", width: 32 },
  { header: "Category *", required: true, what: "Any category. New ones are created for you", example: "Pain Relief", width: 18 },
  { header: "Cost Price *", required: true, what: "What you pay per piece, in pesos (numbers only)", example: "3.50", width: 12 },
  { header: "Selling Price *", required: true, what: "What the customer pays per piece, in pesos (numbers only)", example: "6.00", width: 13 },
  { header: "Barcode", required: false, what: "Scan or type the barcode. Must be unique", example: "4800010000000", width: 16 },
  { header: "Brand", required: false, what: "Brand or maker", example: "Unilab", width: 14 },
  { header: "Supplier", required: false, what: "Who you usually buy it from. New suppliers are created for you", example: "Zuellig Pharma", width: 18 },
  { header: "Starting Stock", required: false, what: "How many you have now at this branch (whole number). Blank = 0", example: "120", width: 14 },
  { header: "Minimum Stock", required: false, what: "Low-stock alert level (whole number). Blank = 0", example: "20", width: 14 },
  { header: "Reorder Point", required: false, what: "When to reorder (whole number). Blank = same as Minimum Stock", example: "30", width: 13 },
  { header: "VATable (Yes/No)", required: false, what: "Yes if the price includes 12% VAT. Blank = Yes", example: "Yes", width: 16 },
  { header: "Batch / Lot Number", required: false, what: "Lot number of the starting stock, if it has one", example: "L2405A", width: 18 },
  { header: "Expiry Date (YYYY-MM-DD)", required: false, what: "Expiry of the starting stock. Fill this to get expiry alerts", example: "2027-06-30", width: 24 },
  { header: "Generic Name (pharmacy)", required: false, what: "Pharmacy only: generic name", example: "Paracetamol", width: 22 },
  { header: "Strength (pharmacy)", required: false, what: "Pharmacy only: e.g. 500mg, 5mg/5mL", example: "500mg", width: 18 },
  { header: "Dosage Form (pharmacy)", required: false, what: "Pharmacy only: tablet, capsule, syrup…", example: "Tablet", width: 21 },
  { header: "Requires Prescription (pharmacy)", required: false, what: "Pharmacy only: Yes for Rx-only medicines. Blank = No", example: "No", width: 30 },
  { header: "Description", required: false, what: "Any notes about the product", example: "", width: 28 },
];

const EXAMPLES: Record<string, string | number>[] = [
  {
    "Product Name *": "Biogesic 500mg Tablet",
    "Category *": "Pain Relief",
    "Cost Price *": 3.5,
    "Selling Price *": 6,
    Barcode: "4800010000000",
    Brand: "Unilab",
    Supplier: "Zuellig Pharma",
    "Starting Stock": 120,
    "Minimum Stock": 20,
    "Reorder Point": 30,
    "VATable (Yes/No)": "Yes",
    "Batch / Lot Number": "L2405A",
    "Expiry Date (YYYY-MM-DD)": "2027-06-30",
    "Generic Name (pharmacy)": "Paracetamol",
    "Strength (pharmacy)": "500mg",
    "Dosage Form (pharmacy)": "Tablet",
    "Requires Prescription (pharmacy)": "No",
  },
  {
    "Product Name *": "Amoxicillin 500mg Capsule",
    "Category *": "Antibiotics",
    "Cost Price *": 8,
    "Selling Price *": 15,
    Supplier: "Metro Drug",
    "Starting Stock": 200,
    "Minimum Stock": 50,
    "Expiry Date (YYYY-MM-DD)": "2027-01-31",
    "Generic Name (pharmacy)": "Amoxicillin",
    "Strength (pharmacy)": "500mg",
    "Dosage Form (pharmacy)": "Capsule",
    "Requires Prescription (pharmacy)": "Yes",
  },
  {
    "Product Name *": "Bond Paper A4 (ream)",
    "Category *": "School & Office",
    "Cost Price *": 180,
    "Selling Price *": 235,
    Barcode: "4801234500012",
    Brand: "Hard Copy",
    "Starting Stock": 40,
    "Minimum Stock": 10,
  },
  {
    "Product Name *": "Bottled Water 500mL",
    "Category *": "Beverages",
    "Cost Price *": 9,
    "Selling Price *": 15,
    "Starting Stock": 96,
    "VATable (Yes/No)": "Yes",
  },
];

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [categories, suppliers] = await Promise.all([
      prisma.category.findMany({ where: { tenantId: session.tenantId, isActive: true }, orderBy: { name: "asc" }, select: { name: true } }),
      prisma.supplier.findMany({ where: { tenantId: session.tenantId, isActive: true }, orderBy: { name: "asc" }, select: { name: true } }),
    ]);

    const workbook = XLSX.utils.book_new();

    // 1. The sheet to fill: headers only.
    const products = XLSX.utils.aoa_to_sheet([COLUMNS.map((c) => c.header)]);
    products["!cols"] = COLUMNS.map((c) => ({ wch: c.width }));
    products["!freeze"] = { xSplit: 1, ySplit: 1 };
    XLSX.utils.book_append_sheet(workbook, products, "Products");

    // 2. How to fill it: one line per column.
    const howTo = XLSX.utils.aoa_to_sheet([
      ["HOW TO FILL THE PRODUCTS SHEET"],
      ["Fill one product per row in the Products sheet. Only the 4 columns marked * are required — leave anything that doesn't apply blank."],
      ["Columns marked (pharmacy) are for medicines; other stores can ignore them. Don't rename or delete the header row."],
      ["Then in Nookly: Inventory → choose \"Add new products\" → Import spreadsheet. You'll see a preview before anything is saved."],
      [],
      ["Column", "Required?", "What to put", "Example"],
      ...COLUMNS.map((c) => [c.header.replace(/ \*$/, ""), c.required ? "REQUIRED" : "Optional", c.what, c.example]),
    ]);
    howTo["!cols"] = [{ wch: 32 }, { wch: 11 }, { wch: 66 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(workbook, howTo, "How to fill");

    // 3. Filled examples for a pharmacy and a general store (not imported).
    const examples = XLSX.utils.json_to_sheet(EXAMPLES, { header: COLUMNS.map((c) => c.header) });
    examples["!cols"] = COLUMNS.map((c) => ({ wch: c.width }));
    XLSX.utils.book_append_sheet(workbook, examples, "Examples");

    // 4. What already exists, to match names exactly.
    const lists = XLSX.utils.aoa_to_sheet([
      ["Your categories", "Your suppliers"],
      ...Array.from({ length: Math.max(categories.length, suppliers.length, 1) }, (_, i) => [categories[i]?.name ?? "", suppliers[i]?.name ?? ""]),
    ]);
    lists["!cols"] = [{ wch: 30 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(workbook, lists, "Categories & suppliers");

    const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(excelBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="nookly-product-import-template.xlsx"',
      },
    });
  } catch (error) {
    console.error("Error generating import template", error);
    return NextResponse.json({ error: "Failed to generate template" }, { status: 500 });
  }
}

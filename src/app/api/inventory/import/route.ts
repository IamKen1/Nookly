import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import type { SessionPayload } from "@/lib/auth";
import { DrugSchedule, Prisma } from "@prisma/client";
import { invalidateCached } from "@/lib/route-cache";

interface ImportIssue {
  row: number;
  field: string;
  message: string;
}

type RowData = Record<string, unknown>;

const DRUG_SCHEDULE_VALUES: DrugSchedule[] = ["SCHEDULE_I", "SCHEDULE_II", "SCHEDULE_III", "SCHEDULE_IV", "SCHEDULE_V"];

const getFieldValue = (row: RowData, candidates: string[]): unknown => {
  for (const candidate of candidates) {
    if (row[candidate] !== undefined && row[candidate] !== null && row[candidate] !== "") return row[candidate];
  }
  const normalizedCandidates = candidates.map((c) => c.replace(/\s+/g, "").toLowerCase());
  for (const [key, value] of Object.entries(row)) {
    if (normalizedCandidates.includes(key.replace(/\s+/g, "").toLowerCase()) && value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
};

const getTextValue = (row: RowData, candidates: string[]): string => {
  const value = getFieldValue(row, candidates);
  return value === undefined || value === null ? "" : String(value).trim();
};

const parseNumber = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).replace(/,/g, "").replace(/%/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseInteger = (value: unknown): number | null => {
  const parsed = parseNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
};

const parseYesNo = (value: unknown, defaultValue: boolean): boolean => {
  if (value === undefined || value === null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["yes", "true", "1"].includes(normalized)) return true;
  if (["no", "false", "0"].includes(normalized)) return false;
  return defaultValue;
};

const normalizeDrugSchedule = (value: string): DrugSchedule | null => {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "_");
  return DRUG_SCHEDULE_VALUES.includes(normalized as DrugSchedule) ? (normalized as DrugSchedule) : null;
};

const buildProductName = (row: RowData): string => {
  const productName = getTextValue(row, ["Product Name"]);
  if (productName) return productName;
  const brandName = getTextValue(row, ["Brand Name"]);
  if (brandName) return brandName;
  const genericName = getTextValue(row, ["Generic Name"]);
  const dosage = getTextValue(row, ["Dosage", "Strength"]);
  const dosageForm = getTextValue(row, ["Dosage Form"]);
  return [genericName, dosage, dosageForm].filter(Boolean).join(" ").trim();
};

const getCategoryName = (row: RowData): string => getTextValue(row, ["Category", "Use", "Therapeutic Use"]);

const buildProductPayload = (row: RowData, categoryId: string) => {
  const productName = buildProductName(row);
  const costPrice = parseNumber(getFieldValue(row, ["Cost Price", "Cost Price Per Piece", "COST PRICE PER PIECE"])) ?? 0;
  const sellingPrice =
    parseNumber(getFieldValue(row, ["Selling Price", "Selling Price Per Piece", "SELLING PRICE PER PIECE AS PER GOOGLE", "SELLING PRICE PER PIECE"])) ?? 0;
  const currentStock = parseInteger(getFieldValue(row, ["Current Stock"])) ?? 0;
  const minimumStock = parseInteger(getFieldValue(row, ["Minimum Stock"])) ?? 0;
  const maximumStock = parseInteger(getFieldValue(row, ["Maximum Stock"]));
  const reorderPoint = parseInteger(getFieldValue(row, ["Reorder Point"])) ?? minimumStock;
  const weight = parseNumber(getFieldValue(row, ["Net Weight", "Weight"]));
  const expiryDateValue = getTextValue(row, ["Expiry Date"]);
  const expiryDate = expiryDateValue ? new Date(expiryDateValue) : null;

  return {
    name: productName,
    genericName: getTextValue(row, ["Generic Name"]) || null,
    brandName: getTextValue(row, ["Brand Name"]) || null,
    barcode: getTextValue(row, ["Barcode"]) || null,
    description: getTextValue(row, ["Description"]) || null,
    strength: getTextValue(row, ["Strength", "Dosage"]) || null,
    dosageForm: getTextValue(row, ["Dosage Form"]) || null,
    manufacturer: getTextValue(row, ["Manufacturer"]) || null,
    classification: getTextValue(row, ["Classification"]).toUpperCase() || null,
    therapeuticUse: getTextValue(row, ["Therapeutic Use", "Use"]) || null,
    categoryId,
    productType: getTextValue(row, ["Product Type"]) || null,
    sku: getTextValue(row, ["SKU"]) || null,
    weight,
    dimensions: getTextValue(row, ["Dimensions"]) || null,
    color: getTextValue(row, ["Color"]) || null,
    size: getTextValue(row, ["Size"]) || null,
    material: getTextValue(row, ["Material"]) || null,
    expiryDate: expiryDate && !Number.isNaN(expiryDate.getTime()) ? expiryDate : null,
    costPrice,
    costPricePerBox: parseNumber(getFieldValue(row, ["Cost Price Per Box", "COST PRICE PER BOX"])),
    sellingPrice,
    currentStock,
    minimumStock,
    maximumStock,
    reorderPoint,
    drugSchedule: normalizeDrugSchedule(getTextValue(row, ["Drug Schedule"])),
    requiresPrescription: parseYesNo(getFieldValue(row, ["Requires Prescription"]), false),
    isOTC: parseYesNo(getFieldValue(row, ["Is OTC"]), true),
    isVatable: parseYesNo(getFieldValue(row, ["Is VATable", "Is Vatable"]), true),
    isActive: parseYesNo(getFieldValue(row, ["Is Active"]), true),
  };
};

const ensureCategory = async (
  tenantId: string,
  row: RowData,
  categoryMap: Map<string, string>,
  warnings: ImportIssue[],
  rowNumber: number
) => {
  const rawCategoryName = getCategoryName(row);
  if (!rawCategoryName) return null;

  const normalizedName = rawCategoryName.toLowerCase();
  const existingCategoryId = categoryMap.get(normalizedName);
  if (existingCategoryId) return existingCategoryId;

  const createdCategory = await prisma.category.create({
    data: { tenantId, name: rawCategoryName, description: "Auto-created from inventory import" },
  });
  categoryMap.set(normalizedName, createdCategory.id);
  warnings.push({ row: rowNumber, field: "Category", message: `Created missing category "${rawCategoryName}" from import data` });
  return createdCategory.id;
};

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const mode = formData.get("mode") as string;

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet) as RowData[];

    const errors: ImportIssue[] = [];
    const warnings: ImportIssue[] = [];
    let processed = 0;
    let created = 0;
    let updated = 0;
    let skipped = 0;

    const categories = await prisma.category.findMany({ where: { tenantId: session.tenantId, isActive: true } });
    const categoryMap = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2;

      try {
        let result: "created" | "updated" | "skipped" = "skipped";
        if (mode === "correction") {
          result = await processStockCorrection(session, row, rowNumber, errors, warnings);
        } else if (mode === "add") {
          result = await processAddProduct(session, row, rowNumber, categoryMap, errors, warnings);
        } else if (mode === "update") {
          result = await processUpdateProduct(session, row, rowNumber, categoryMap, errors, warnings);
        } else {
          errors.push({ row: rowNumber, field: "mode", message: `Unknown import mode "${mode}"` });
        }
        processed++;
        if (result === "created") created++;
        else if (result === "updated") updated++;
        else skipped++;
      } catch (error) {
        errors.push({ row: rowNumber, field: "general", message: (error as Error).message });
      }
    }

    const success = errors.length === 0;
    const parts = [];
    if (created > 0) parts.push(`${created} created`);
    if (updated > 0) parts.push(`${updated} updated`);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    const message = success
      ? `Successfully processed ${processed} rows: ${parts.join(", ") || "no changes"}`
      : `Processed ${processed} rows (${parts.join(", ") || "no changes"}) with ${errors.length} error(s)`;

    invalidateCached(`products:${session.tenantId}`);
    return NextResponse.json({ success, message, processed, created, updated, skipped, errors, warnings });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json({ error: "Import failed: " + (error as Error).message }, { status: 500 });
  }
}

async function processStockCorrection(
  session: SessionPayload,
  row: RowData,
  rowNumber: number,
  errors: ImportIssue[],
  warnings: ImportIssue[]
): Promise<"created" | "updated" | "skipped"> {
  const productId = String(row["Product ID"] ?? "");
  const actualCount = parseFloat(String(row["Actual Count"] ?? ""));
  const notes = String(row["Notes"] ?? "");

  if (!productId) {
    errors.push({ row: rowNumber, field: "Product ID", message: "Product ID is required" });
    return "skipped";
  }
  if (isNaN(actualCount)) {
    errors.push({ row: rowNumber, field: "Actual Count", message: "Actual Count must be a valid number" });
    return "skipped";
  }

  const product = await prisma.product.findFirst({ where: { id: productId, tenantId: session.tenantId } });
  if (!product) {
    errors.push({ row: rowNumber, field: "Product ID", message: "Product not found" });
    return "skipped";
  }

  const stock = await prisma.productStock.findUnique({
    where: { productId_storeId: { productId, storeId: session.storeId! } },
  });
  const currentStock = stock?.currentStock ?? 0;
  const difference = actualCount - currentStock;

  if (difference === 0) {
    warnings.push({ row: rowNumber, field: "Stock", message: "No adjustment needed - stock matches" });
    return "skipped";
  }

  await prisma.productStock.upsert({
    where: { productId_storeId: { productId, storeId: session.storeId! } },
    update: { currentStock: actualCount },
    create: { productId, storeId: session.storeId!, currentStock: actualCount },
  });

  await prisma.stockMovement.create({
    data: {
      tenantId: session.tenantId,
      storeId: session.storeId!,
      productId,
      type: "ADJUSTMENT",
      quantity: difference,
      reason: `Stock correction: ${notes}`,
      notes: `Previous: ${currentStock}, New: ${actualCount}, Difference: ${difference}`,
      userId: session.userId,
    },
  });

  return "updated";
}

async function processAddProduct(
  session: SessionPayload,
  row: RowData,
  rowNumber: number,
  categoryMap: Map<string, string>,
  errors: ImportIssue[],
  warnings: ImportIssue[]
): Promise<"created" | "updated" | "skipped"> {
  const productName = buildProductName(row);
  if (!productName) {
    errors.push({ row: rowNumber, field: "Product Name", message: "Product name, brand name, or generic name with dosage is required" });
    return "skipped";
  }

  const categoryId = await ensureCategory(session.tenantId, row, categoryMap, warnings, rowNumber);
  if (!categoryId) {
    errors.push({ row: rowNumber, field: "Category/Use", message: "Category or Use is required" });
    return "skipped";
  }

  const payload = buildProductPayload(row, categoryId);
  if (payload.costPrice <= 0) {
    errors.push({ row: rowNumber, field: "Cost Price", message: "A valid cost price is required" });
    return "skipped";
  }
  if (payload.sellingPrice <= 0) {
    errors.push({ row: rowNumber, field: "Selling Price", message: "A valid selling price is required" });
    return "skipped";
  }

  const existingProduct = await prisma.product.findFirst({
    where: {
      tenantId: session.tenantId,
      isActive: true,
      OR: [
        { name: productName, strength: payload.strength, dosageForm: payload.dosageForm },
        ...(payload.barcode ? [{ barcode: payload.barcode }] : []),
      ],
    },
  });

  if (existingProduct) {
    const isDupeBarcode = Boolean(payload.barcode && existingProduct.barcode === payload.barcode);
    warnings.push({
      row: rowNumber,
      field: isDupeBarcode ? "Barcode" : "Product",
      message: `Skipped: product already exists ("${existingProduct.name}")`,
    });
    return "skipped";
  }

  const { currentStock, ...productData } = payload;

  try {
    await prisma.product.create({
      data: {
        tenantId: session.tenantId,
        ...productData,
        costPrice: new Prisma.Decimal(productData.costPrice),
        sellingPrice: new Prisma.Decimal(productData.sellingPrice),
        costPricePerBox: productData.costPricePerBox != null ? new Prisma.Decimal(productData.costPricePerBox) : null,
        stocks: { create: { storeId: session.storeId!, currentStock } },
      },
    });
    return "created";
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      warnings.push({ row: rowNumber, field: "Barcode/SKU", message: "Skipped: duplicate barcode or SKU for this tenant" });
      return "skipped";
    }
    throw error;
  }
}

async function processUpdateProduct(
  session: SessionPayload,
  row: RowData,
  rowNumber: number,
  categoryMap: Map<string, string>,
  errors: ImportIssue[],
  warnings: ImportIssue[]
): Promise<"created" | "updated" | "skipped"> {
  const productId = getTextValue(row, ["Product ID"]);
  const productName = buildProductName(row);

  let product = null;
  if (productId) {
    product = await prisma.product.findFirst({ where: { id: productId, tenantId: session.tenantId } });
  } else if (productName) {
    product = await prisma.product.findFirst({ where: { name: productName, tenantId: session.tenantId } });
  }

  if (!product) {
    errors.push({ row: rowNumber, field: "Product ID/Name", message: "Product not found for update" });
    return "skipped";
  }

  let categoryId = product.categoryId;
  const resolvedCategoryId = await ensureCategory(session.tenantId, row, categoryMap, warnings, rowNumber);
  if (resolvedCategoryId) categoryId = resolvedCategoryId;

  const payload = buildProductPayload(row, categoryId);

  await prisma.product.update({
    where: { id: product.id },
    data: {
      ...(payload.name && { name: payload.name }),
      ...(getFieldValue(row, ["Generic Name"]) !== undefined && { genericName: payload.genericName }),
      ...(getFieldValue(row, ["Brand Name"]) !== undefined && { brandName: payload.brandName }),
      ...(getFieldValue(row, ["Barcode"]) !== undefined && { barcode: payload.barcode }),
      ...(getFieldValue(row, ["Description"]) !== undefined && { description: payload.description }),
      ...(getFieldValue(row, ["Strength", "Dosage"]) !== undefined && { strength: payload.strength }),
      ...(getFieldValue(row, ["Dosage Form"]) !== undefined && { dosageForm: payload.dosageForm }),
      ...(getFieldValue(row, ["Manufacturer"]) !== undefined && { manufacturer: payload.manufacturer }),
      ...(getFieldValue(row, ["Classification"]) !== undefined && { classification: payload.classification }),
      ...(getFieldValue(row, ["Therapeutic Use", "Use"]) !== undefined && { therapeuticUse: payload.therapeuticUse }),
      ...(categoryId && { categoryId }),
      ...(getFieldValue(row, ["Cost Price", "Cost Price Per Piece", "COST PRICE PER PIECE"]) !== undefined && {
        costPrice: payload.costPrice,
      }),
      ...(getFieldValue(row, ["Cost Price Per Box", "COST PRICE PER BOX"]) !== undefined && {
        costPricePerBox: payload.costPricePerBox,
      }),
      ...(getFieldValue(row, ["Selling Price", "Selling Price Per Piece", "SELLING PRICE PER PIECE"]) !== undefined && {
        sellingPrice: payload.sellingPrice,
      }),
      ...(getFieldValue(row, ["Minimum Stock"]) !== undefined && { minimumStock: payload.minimumStock }),
      ...(getFieldValue(row, ["Maximum Stock"]) !== undefined && { maximumStock: payload.maximumStock }),
      ...(getFieldValue(row, ["Reorder Point"]) !== undefined && { reorderPoint: payload.reorderPoint }),
      ...(getFieldValue(row, ["Drug Schedule"]) !== undefined && { drugSchedule: payload.drugSchedule }),
      ...(getFieldValue(row, ["Requires Prescription"]) !== undefined && { requiresPrescription: payload.requiresPrescription }),
      ...(getFieldValue(row, ["Is OTC"]) !== undefined && { isOTC: payload.isOTC }),
      ...(getFieldValue(row, ["Is VATable", "Is Vatable"]) !== undefined && { isVatable: payload.isVatable }),
      ...(getFieldValue(row, ["Is Active"]) !== undefined && { isActive: payload.isActive }),
      ...(getFieldValue(row, ["SKU"]) !== undefined && { sku: payload.sku }),
      ...(getFieldValue(row, ["Net Weight", "Weight"]) !== undefined && { weight: payload.weight }),
      ...(getFieldValue(row, ["Dimensions"]) !== undefined && { dimensions: payload.dimensions }),
      ...(getFieldValue(row, ["Color"]) !== undefined && { color: payload.color }),
      ...(getFieldValue(row, ["Size"]) !== undefined && { size: payload.size }),
      ...(getFieldValue(row, ["Material"]) !== undefined && { material: payload.material }),
      ...(getFieldValue(row, ["Expiry Date"]) !== undefined && { expiryDate: payload.expiryDate }),
    },
  });

  if (getFieldValue(row, ["Current Stock"]) !== undefined && session.storeId) {
    await prisma.productStock.upsert({
      where: { productId_storeId: { productId: product.id, storeId: session.storeId } },
      update: { currentStock: payload.currentStock },
      create: { productId: product.id, storeId: session.storeId, currentStock: payload.currentStock },
    });
  }

  return "updated";
}

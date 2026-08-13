import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { invalidateCached } from "@/lib/route-cache";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.product.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!existing) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  const body = await request.json();
  const {
    name,
    genericName,
    brandName,
    barcode,
    description,
    strength,
    dosageForm,
    manufacturer,
    costPrice,
    sellingPrice,
    insurancePrice,
    minimumStock,
    maximumStock,
    reorderPoint,
    requiresPrescription,
    isOTC,
    isVatable,
    categoryId,
    currentStock,
    drugSchedule,
    imageUrl,
  } = body;

  try {
    const product = await prisma.product.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(genericName !== undefined ? { genericName } : {}),
        ...(brandName !== undefined ? { brandName } : {}),
        ...(barcode !== undefined ? { barcode: barcode || null } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(strength !== undefined ? { strength } : {}),
        ...(dosageForm !== undefined ? { dosageForm } : {}),
        ...(manufacturer !== undefined ? { manufacturer } : {}),
        ...(costPrice !== undefined ? { costPrice } : {}),
        ...(sellingPrice !== undefined ? { sellingPrice } : {}),
        ...(insurancePrice !== undefined ? { insurancePrice } : {}),
        ...(minimumStock !== undefined ? { minimumStock } : {}),
        ...(maximumStock !== undefined ? { maximumStock: maximumStock || null } : {}),
        ...(reorderPoint !== undefined ? { reorderPoint } : {}),
        ...(requiresPrescription !== undefined ? { requiresPrescription } : {}),
        ...(isOTC !== undefined ? { isOTC } : {}),
        ...(isVatable !== undefined ? { isVatable } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(drugSchedule !== undefined ? { drugSchedule: drugSchedule || null } : {}),
        ...(imageUrl !== undefined ? { imageUrl: imageUrl || null } : {}),
      },
    });

    if (currentStock !== undefined && session.storeId) {
      await prisma.productStock.upsert({
        where: { productId_storeId: { productId: id, storeId: session.storeId } },
        update: { currentStock },
        create: { productId: id, storeId: session.storeId, currentStock },
      });
    }

    invalidateCached(`products:${session.tenantId}`);
    return NextResponse.json(product);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A product with this barcode already exists." }, { status: 409 });
    }
    console.error("Error updating product", error);
    return NextResponse.json({ error: "Failed to update product." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.product.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!existing) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  await prisma.product.update({ where: { id }, data: { isActive: false } });
  invalidateCached(`products:${session.tenantId}`);
  return NextResponse.json({ ok: true });
}

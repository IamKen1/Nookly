import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const categories = await prisma.category.findMany({
    where: { tenantId: session.tenantId, isActive: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(categories);
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "products_edit"))) {
    return NextResponse.json({ error: "You don't have permission to edit products." }, { status: 403 });
  }

  const { name, description } = await request.json();
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Category name is required." }, { status: 400 });
  }

  try {
    const category = await prisma.category.create({
      data: { tenantId: session.tenantId, name: name.trim(), description: description || null },
    });
    return NextResponse.json(category, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A category with this name already exists." }, { status: 409 });
    }
    console.error("Error creating category", error);
    return NextResponse.json({ error: "Failed to create category." }, { status: 500 });
  }
}

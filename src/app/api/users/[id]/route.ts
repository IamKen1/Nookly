import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "users"))) {
    return NextResponse.json({ error: "You don't have permission to manage users." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.user.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!existing) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const body = await request.json();
  const { email, username, firstName, lastName, role, password, storeId, isActive } = body;

  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(email !== undefined ? { email } : {}),
        ...(username !== undefined ? { username } : {}),
        ...(firstName !== undefined ? { firstName } : {}),
        ...(lastName !== undefined ? { lastName } : {}),
        ...(role !== undefined ? { role } : {}),
        ...(storeId !== undefined ? { storeId } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(password ? { password: await hashPassword(password) } : {}),
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        storeId: true,
        isActive: true,
        createdAt: true,
      },
    });
    return NextResponse.json(user);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A user with this email or username already exists." }, { status: 409 });
    }
    console.error("Error updating user", error);
    return NextResponse.json({ error: "Failed to update user." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "users"))) {
    return NextResponse.json({ error: "You don't have permission to manage users." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.user.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!existing) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const salesCount = await prisma.sale.count({ where: { userId: id } });
  if (salesCount > 0) {
    await prisma.user.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ ok: true, deactivated: true, message: "User has sales history — deactivated instead of deleted." });
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true, deactivated: false });
}

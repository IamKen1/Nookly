import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { UserRole } from "@prisma/client";
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

  if (storeId && !(await prisma.store.findFirst({ where: { id: storeId, tenantId: session.tenantId, isActive: true } }))) {
    return NextResponse.json({ error: "Branch not found." }, { status: 400 });
  }

  // Role and owner safety: no one changes their own role or deactivates
  // themselves, only an owner can touch an owner account or create another
  // owner, and a workspace always keeps at least one active owner.
  if (role !== undefined && !Object.values(UserRole).includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }
  const isSelf = existing.id === session.userId;
  if (isSelf && role !== undefined && role !== existing.role) {
    return NextResponse.json({ error: "You can't change your own role." }, { status: 403 });
  }
  if (isSelf && isActive === false) {
    return NextResponse.json({ error: "You can't deactivate your own account." }, { status: 403 });
  }
  if ((existing.role === "OWNER" || role === "OWNER") && session.role !== "OWNER") {
    return NextResponse.json({ error: "Only an owner can change an owner's account or make someone an owner." }, { status: 403 });
  }
  if (existing.role === "OWNER" && ((role !== undefined && role !== "OWNER") || isActive === false)) {
    const otherOwners = await prisma.user.count({ where: { tenantId: session.tenantId, role: "OWNER", isActive: true, id: { not: id } } });
    if (otherOwners === 0) {
      return NextResponse.json({ error: "Every workspace needs at least one active owner." }, { status: 400 });
    }
  }

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
  if (existing.id === session.userId) {
    return NextResponse.json({ error: "You can't remove your own account." }, { status: 403 });
  }
  if (existing.role === "OWNER") {
    if (session.role !== "OWNER") {
      return NextResponse.json({ error: "Only an owner can remove an owner." }, { status: 403 });
    }
    const otherOwners = await prisma.user.count({ where: { tenantId: session.tenantId, role: "OWNER", isActive: true, id: { not: id } } });
    if (otherOwners === 0) return NextResponse.json({ error: "Every workspace needs at least one active owner." }, { status: 400 });
  }

  const [salesCount, ordersTakenCount] = await Promise.all([
    prisma.sale.count({ where: { OR: [{ userId: id }, { orderTakerId: id }] } }),
    prisma.pendingOrder.count({ where: { createdById: id } }),
  ]);
  if (salesCount > 0 || ordersTakenCount > 0) {
    await prisma.user.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ ok: true, deactivated: true, message: "User has sales history — deactivated instead of deleted." });
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true, deactivated: false });
}

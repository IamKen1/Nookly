import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hashPassword } from "@/lib/auth";

const CAN_MANAGE_ROLES = ["OWNER", "ADMIN"];

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await prisma.user.findMany({
    where: { tenantId: session.tenantId },
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
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!CAN_MANAGE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "You don't have permission to manage users." }, { status: 403 });
  }

  const body = await request.json();
  const { email, username, firstName, lastName, role, password, storeId } = body;

  if (!email || !username || !firstName || !lastName || !password) {
    return NextResponse.json({ error: "email, username, firstName, lastName and password are required." }, { status: 400 });
  }

  const [plan, userCount] = await Promise.all([
    prisma.subscription.findUnique({ where: { tenantId: session.tenantId }, include: { plan: true } }),
    prisma.user.count({ where: { tenantId: session.tenantId, isActive: true } }),
  ]);
  const maxUsers = plan?.plan.maxUsers ?? -1;
  if (maxUsers !== -1 && userCount >= maxUsers) {
    return NextResponse.json(
      { error: `You've reached the ${maxUsers}-user limit for the ${plan?.plan.name} plan. Upgrade to add more.` },
      { status: 403 }
    );
  }

  try {
    const user = await prisma.user.create({
      data: {
        tenantId: session.tenantId,
        email,
        username,
        firstName,
        lastName,
        role: role || "CASHIER",
        password: await hashPassword(password),
        storeId: storeId || session.storeId || null,
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
    return NextResponse.json(user, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A user with this email or username already exists." }, { status: 409 });
    }
    console.error("Error creating user", error);
    return NextResponse.json({ error: "Failed to create user." }, { status: 500 });
  }
}

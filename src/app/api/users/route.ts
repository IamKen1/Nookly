import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { hasPermission } from "@/lib/permissions";
import { checkNewStaffCode, staffCodeRequired } from "@/lib/staff-code";

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
      staffCodeHash: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Only whether a security code is set — never the code.
  return NextResponse.json(users.map(({ staffCodeHash, ...u }) => ({ ...u, hasStaffCode: Boolean(staffCodeHash) })));
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "users"))) {
    return NextResponse.json({ error: "You don't have permission to manage users." }, { status: 403 });
  }

  const body = await request.json();
  const { email, username, firstName, lastName, role, password, storeId, staffCode } = body;

  if (!email || !username || !firstName || !lastName || !password) {
    return NextResponse.json({ error: "email, username, firstName, lastName and password are required." }, { status: 400 });
  }
  if (role !== undefined && role !== "" && !Object.values(UserRole).includes(role) || role === "ORDER_TAKER") {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }
  if (role === "OWNER" && session.role !== "OWNER") {
    return NextResponse.json({ error: "Only an owner can add another owner." }, { status: 403 });
  }

  if (storeId && !(await prisma.store.findFirst({ where: { id: storeId, tenantId: session.tenantId, isActive: true } }))) {
    return NextResponse.json({ error: "Branch not found." }, { status: 400 });
  }

  // Security code: required for new users while the owner requires codes; optional otherwise.
  const code = typeof staffCode === "string" ? staffCode.trim() : "";
  if (!code && (await staffCodeRequired(session.tenantId))) {
    return NextResponse.json({ error: "Set a security code for this user (4 to 6 digits)." }, { status: 400 });
  }
  const codeCheck = code ? await checkNewStaffCode(session.tenantId, code) : null;
  if (codeCheck && "error" in codeCheck) return NextResponse.json({ error: codeCheck.error }, { status: codeCheck.status });

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
        ...(codeCheck ? { staffCodeHash: codeCheck.hash } : {}),
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

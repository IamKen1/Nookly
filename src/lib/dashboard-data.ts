import type { Prisma } from "@prisma/client";
import type { SessionPayload } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfTodayPH } from "@/lib/timezone";
import { batchesAtStore } from "@/lib/branch-scope";
import { getRolePermissions, saleVisibilityWhere, type PermissionModuleKey } from "@/lib/permissions";

const DAY_MS = 24 * 60 * 60 * 1000;
const PH_OFFSET_MS = 8 * 60 * 60 * 1000;

// Which dashboard a role gets: each one leads with what that person is
// actually responsible for, instead of one generic page for everybody.
export type DashboardKind = "owner" | "manager" | "pharmacist" | "cashier" | "orderTaker";

export function dashboardKindFor(role: string): DashboardKind {
  if (role === "OWNER" || role === "ADMIN") return "owner";
  if (role === "MANAGER") return "manager";
  if (role === "PHARMACIST" || role === "PHARMACY_TECH") return "pharmacist";
  if (role === "ORDER_TAKER") return "orderTaker";
  return "cashier";
}

export interface DashboardScope {
  session: SessionPayload;
  permissions: Record<PermissionModuleKey, boolean>;
  // Sales this viewer may see (own vs everyone's, own branch vs all).
  saleWhere: Prisma.SaleWhereInput;
  // The branch stock figures are about; null = every branch.
  storeId: string | null;
}

export async function getDashboardScope(session: SessionPayload): Promise<DashboardScope> {
  const [permissions, visibility] = await Promise.all([getRolePermissions(session.tenantId, session.role), saleVisibilityWhere(session)]);
  return {
    session,
    permissions,
    saleWhere: { tenantId: session.tenantId, status: "COMPLETED", ...visibility },
    storeId: permissions.all_branches ? null : session.storeId,
  };
}

const sumOf = (agg: { _sum: { totalAmount: Prisma.Decimal | null } }) => Number(agg._sum.totalAmount ?? 0);

// Today so far vs yesterday up to the same time of day — a fair comparison at
// 10am, unlike comparing against all of yesterday.
export async function getTodayVsYesterday(scope: DashboardScope) {
  const now = new Date();
  const todayStart = startOfTodayPH(now);
  const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);
  const yesterdaySameTime = new Date(now.getTime() - DAY_MS);
  const [today, yesterday] = await Promise.all([
    prisma.sale.aggregate({ where: { ...scope.saleWhere, saleDate: { gte: todayStart } }, _sum: { totalAmount: true }, _count: true }),
    prisma.sale.aggregate({
      where: { ...scope.saleWhere, saleDate: { gte: yesterdayStart, lt: yesterdaySameTime } },
      _sum: { totalAmount: true },
      _count: true,
    }),
  ]);
  const todayTotal = sumOf(today);
  const yesterdayTotal = sumOf(yesterday);
  return {
    total: todayTotal,
    transactions: today._count,
    average: today._count ? todayTotal / today._count : 0,
    yesterdayTotal,
    // null when there's nothing to compare against (a % change from ₱0 is meaningless)
    changePct: yesterdayTotal > 0 ? ((todayTotal - yesterdayTotal) / yesterdayTotal) * 100 : null,
  };
}

const phDayKey = (d: Date) => new Date(d.getTime() + PH_OFFSET_MS).toISOString().slice(0, 10);
const phHour = (d: Date) => new Date(d.getTime() + PH_OFFSET_MS).getUTCHours();

// Daily totals for the last `days` PH calendar days (oldest first), plus
// today's sales by hour. One query; bucketed here.
export async function getSalesTrend(scope: DashboardScope, days = 7) {
  const todayStart = startOfTodayPH();
  const from = new Date(todayStart.getTime() - (days - 1) * DAY_MS);
  const sales = await prisma.sale.findMany({
    where: { ...scope.saleWhere, saleDate: { gte: from } },
    select: { saleDate: true, totalAmount: true },
  });

  const daily = Array.from({ length: days }, (_, i) => {
    const date = new Date(from.getTime() + i * DAY_MS);
    return { key: phDayKey(date), date: date.toISOString(), total: 0, count: 0 };
  });
  const byKey = new Map(daily.map((d) => [d.key, d]));
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, total: 0 }));
  for (const s of sales) {
    const bucket = byKey.get(phDayKey(s.saleDate));
    if (bucket) {
      bucket.total += Number(s.totalAmount);
      bucket.count += 1;
    }
    if (s.saleDate >= todayStart) hourly[phHour(s.saleDate)].total += Number(s.totalAmount);
  }
  return { daily, hourly };
}

// Month to date: revenue, cost of goods (at current cost price), profit.
export async function getMonthToDate(scope: DashboardScope) {
  const ph = new Date(Date.now() + PH_OFFSET_MS);
  const monthStart = new Date(Date.UTC(ph.getUTCFullYear(), ph.getUTCMonth(), 1) - PH_OFFSET_MS);
  const items = await prisma.saleItem.findMany({
    where: { sale: { ...scope.saleWhere, saleDate: { gte: monthStart } } },
    select: { quantity: true, returnedQuantity: true, totalPrice: true, product: { select: { costPrice: true } } },
  });
  let revenue = 0;
  let cost = 0;
  for (const i of items) {
    revenue += Number(i.totalPrice);
    cost += (i.quantity - i.returnedQuantity) * Number(i.product.costPrice);
  }
  const profit = revenue - cost;
  return { revenue, profit, margin: revenue > 0 ? (profit / revenue) * 100 : null, monthStart: monthStart.toISOString() };
}

export async function getTopProducts(scope: DashboardScope, sinceDays = 7, take = 5) {
  const since = new Date(startOfTodayPH().getTime() - (sinceDays - 1) * DAY_MS);
  const rows = await prisma.saleItem.groupBy({
    by: ["productId"],
    where: { sale: { ...scope.saleWhere, saleDate: { gte: since } } },
    _sum: { totalPrice: true, quantity: true },
    orderBy: { _sum: { totalPrice: "desc" } },
    take,
  });
  const names = await prisma.product.findMany({ where: { id: { in: rows.map((r) => r.productId) } }, select: { id: true, name: true } });
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  return rows.map((r) => ({
    id: r.productId,
    name: nameOf.get(r.productId) ?? "Deleted product",
    revenue: Number(r._sum.totalPrice ?? 0),
    units: r._sum.quantity ?? 0,
  }));
}

export async function getPaymentMix(scope: DashboardScope, sinceDays = 30) {
  const since = new Date(startOfTodayPH().getTime() - (sinceDays - 1) * DAY_MS);
  const rows = await prisma.sale.groupBy({
    by: ["paymentMethod"],
    where: { ...scope.saleWhere, saleDate: { gte: since } },
    _sum: { totalAmount: true },
  });
  return rows
    .map((r) => ({ method: r.paymentMethod as string, total: Number(r._sum.totalAmount ?? 0) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
}

// Products at or below their own minimum level, worst first.
export async function getLowStock(scope: DashboardScope, take = 6) {
  const stocks = await prisma.productStock.findMany({
    where: {
      store: { tenantId: scope.session.tenantId, isActive: true },
      ...(scope.storeId ? { storeId: scope.storeId } : {}),
      isHidden: false,
      product: { isActive: true },
      currentStock: { lte: 50 },
    },
    select: { currentStock: true, product: { select: { id: true, name: true, minimumStock: true } }, store: { select: { name: true } } },
  });
  const low = stocks
    .filter((s) => s.currentStock <= s.product.minimumStock)
    .sort((a, b) => a.currentStock - b.currentStock || a.product.name.localeCompare(b.product.name));
  return {
    count: low.length,
    outOfStock: low.filter((s) => s.currentStock <= 0).length,
    items: low.slice(0, take).map((s) => ({
      id: s.product.id,
      name: s.product.name,
      stock: s.currentStock,
      minimum: s.product.minimumStock,
      branch: s.store.name,
    })),
  };
}

// Batches with stock that are expired or expire within `withinDays`.
export async function getExpiring(scope: DashboardScope, withinDays = 60, take = 6) {
  const now = new Date();
  const until = new Date(now.getTime() + withinDays * DAY_MS);
  const where: Prisma.ProductBatchWhereInput = {
    quantity: { gt: 0 },
    expirationDate: { lte: until },
    product: { tenantId: scope.session.tenantId, isActive: true },
    ...(scope.storeId ? await batchesAtStore(scope.session.tenantId, scope.storeId) : {}),
  };
  const [count, expired, batches] = await Promise.all([
    prisma.productBatch.count({ where }),
    prisma.productBatch.count({ where: { ...where, expirationDate: { lt: now } } }),
    prisma.productBatch.findMany({
      where,
      orderBy: { expirationDate: "asc" },
      take,
      select: { id: true, batchNumber: true, expirationDate: true, quantity: true, product: { select: { name: true } } },
    }),
  ]);
  return {
    count,
    expired,
    items: batches.map((b) => ({
      id: b.id,
      name: b.product.name,
      batchNumber: b.batchNumber,
      quantity: b.quantity,
      daysLeft: Math.ceil((b.expirationDate.getTime() - now.getTime()) / DAY_MS),
      expirationDate: b.expirationDate.toISOString(),
    })),
  };
}

// Who's on the counter right now and what each shift has rung up.
export async function getOpenShifts(scope: DashboardScope) {
  const shifts = await prisma.shift.findMany({
    where: { tenantId: scope.session.tenantId, closedAt: null, ...(scope.storeId ? { storeId: scope.storeId } : {}) },
    select: {
      id: true,
      openedAt: true,
      user: { select: { firstName: true, lastName: true } },
      store: { select: { name: true } },
      sales: { where: { status: "COMPLETED" }, select: { totalAmount: true } },
    },
    orderBy: { openedAt: "asc" },
  });
  return shifts.map((s) => ({
    id: s.id,
    name: `${s.user.firstName} ${s.user.lastName}`.trim(),
    branch: s.store.name,
    openedAt: s.openedAt.toISOString(),
    total: s.sales.reduce((sum, x) => sum + Number(x.totalAmount), 0),
    count: s.sales.length,
  }));
}

// Today's sales per staff member, best first.
export async function getStaffLeaderboard(scope: DashboardScope, take = 5) {
  const rows = await prisma.sale.groupBy({
    by: ["userId"],
    where: { ...scope.saleWhere, saleDate: { gte: startOfTodayPH() } },
    _sum: { totalAmount: true },
    _count: true,
    orderBy: { _sum: { totalAmount: "desc" } },
    take,
  });
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, firstName: true, lastName: true } });
  const nameOf = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  return rows.map((r) => ({ id: r.userId, name: nameOf.get(r.userId) ?? "Former staff", total: Number(r._sum.totalAmount ?? 0), count: r._count }));
}

// Things waiting on someone: prescriptions, stock requests, cashier orders.
export async function getQueues(scope: DashboardScope) {
  const { tenantId, storeId } = scope.session;
  const [prescriptions, stockRequests, pendingOrders] = await Promise.all([
    scope.permissions.prescriptions ? prisma.prescription.count({ where: { tenantId, status: { in: ["PENDING", "PARTIAL"] } } }) : 0,
    scope.permissions.inventory && storeId ? prisma.stockRequest.count({ where: { tenantId, fromStoreId: storeId, status: "REQUESTED" } }) : 0,
    storeId ? prisma.pendingOrder.count({ where: { tenantId, storeId, status: "OPEN" } }) : 0,
  ]);
  return { prescriptions, stockRequests, pendingOrders };
}

// The signed-in cashier's open shift and their own sales.
export async function getMyCounter(session: SessionPayload) {
  const todayStart = startOfTodayPH();
  const [shift, today, recent] = await Promise.all([
    prisma.shift.findFirst({
      where: { tenantId: session.tenantId, userId: session.userId, closedAt: null },
      select: {
        id: true,
        openedAt: true,
        startingCash: true,
        sales: { where: { status: "COMPLETED" }, select: { totalAmount: true, paymentMethod: true } },
      },
    }),
    prisma.sale.aggregate({
      where: { tenantId: session.tenantId, userId: session.userId, status: "COMPLETED", saleDate: { gte: todayStart } },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.sale.findMany({
      where: { tenantId: session.tenantId, userId: session.userId },
      orderBy: { saleDate: "desc" },
      take: 5,
      select: { id: true, saleNumber: true, saleDate: true, totalAmount: true, paymentMethod: true, status: true, _count: { select: { items: true } } },
    }),
  ]);
  const shiftTotal = shift?.sales.reduce((s, x) => s + Number(x.totalAmount), 0) ?? 0;
  const shiftCash = shift?.sales.filter((x) => x.paymentMethod === "CASH").reduce((s, x) => s + Number(x.totalAmount), 0) ?? 0;
  return {
    shift: shift
      ? {
          openedAt: shift.openedAt.toISOString(),
          startingCash: Number(shift.startingCash),
          total: shiftTotal,
          count: shift.sales.length,
          cashSales: shiftCash,
        }
      : null,
    todayTotal: Number(today._sum.totalAmount ?? 0),
    todayCount: today._count,
    recent: recent.map((r) => ({
      id: r.id,
      saleNumber: r.saleNumber,
      saleDate: r.saleDate.toISOString(),
      total: Number(r.totalAmount),
      paymentMethod: r.paymentMethod as string,
      status: r.status as string,
      items: r._count.items,
    })),
  };
}

// Orders this order taker sent today, and where they stand.
export async function getMyOrders(session: SessionPayload) {
  const orders = await prisma.pendingOrder.findMany({
    where: { tenantId: session.tenantId, createdById: session.userId, createdAt: { gte: startOfTodayPH() } },
    select: { status: true },
  });
  return {
    sent: orders.length,
    waiting: orders.filter((o) => o.status === "OPEN").length,
    completed: orders.filter((o) => o.status === "COMPLETED").length,
    cancelled: orders.filter((o) => o.status === "CANCELLED").length,
  };
}

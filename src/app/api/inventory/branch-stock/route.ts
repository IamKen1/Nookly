import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";

const PAGE_SIZE = 100;

// Stock of each product at every branch, so staff can see which branch has
// an item before sending a customer elsewhere or requesting a transfer.
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "inventory"))) {
    return NextResponse.json({ error: "You don't have access to Inventory." }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const search = params.get("search")?.trim() ?? "";
  // One page at a time; sorting covers every matching product, not just the page.
  const sort = params.get("sort") === "stock" || params.get("sort") === "price" ? params.get("sort")! : "name";
  const dir = params.get("dir") === "desc" ? "desc" : "asc";
  const offset = Math.max(0, Math.trunc(Number(params.get("offset"))) || 0);

  const where: Prisma.ProductWhereInput = {
    tenantId: session.tenantId,
    isActive: true,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { genericName: { contains: search, mode: "insensitive" } },
            { barcode: { contains: search } },
          ],
        }
      : {}),
  };
  const select = {
    id: true,
    name: true,
    minimumStock: true,
    sellingPrice: true,
    stocks: { select: { storeId: true, currentStock: true, sellingPrice: true, isHidden: true } },
  } satisfies Prisma.ProductSelect;

  const stores = await prisma.store.findMany({
    where: { tenantId: session.tenantId, isActive: true },
    select: { id: true, name: true },
    orderBy: [{ isMainBranch: "desc" }, { createdAt: "asc" }],
  });

  let products: Prisma.ProductGetPayload<{ select: typeof select }>[];
  let total: number;
  if (sort === "name") {
    [products, total] = await Promise.all([
      prisma.product.findMany({ where, select, orderBy: [{ name: dir }, { id: "asc" }], skip: offset, take: PAGE_SIZE }),
      prisma.product.count({ where }),
    ]);
  } else if (sort === "stock") {
    // Total across the branches that sell it, as the rows show, added up and
    // ordered by the database. Products no branch sells or stocks count as 0:
    // first going up, last going down.
    const counted: Prisma.ProductStockWhereInput = { storeId: { in: stores.map((s) => s.id) }, isHidden: false, product: where };
    const noRows: Prisma.ProductWhereInput = { AND: [where, { stocks: { none: { storeId: { in: stores.map((s) => s.id) }, isHidden: false } } }] };
    const [withCount, noRowCount] = await Promise.all([
      prisma.product.count({ where: { AND: [where, { stocks: { some: { storeId: { in: stores.map((s) => s.id) }, isHidden: false } } }] } }),
      prisma.product.count({ where: noRows }),
    ]);
    const summedPage = async (skip: number, take: number) =>
      take <= 0
        ? []
        : (
            await prisma.productStock.groupBy({
              by: ["productId"],
              where: counted,
              _sum: { currentStock: true },
              orderBy: [{ _sum: { currentStock: dir } }, { productId: "asc" }],
              skip,
              take,
            })
          ).map((g) => g.productId);
    const noRowPage = async (skip: number, take: number) =>
      take <= 0 ? [] : (await prisma.product.findMany({ where: noRows, select: { id: true }, orderBy: [{ name: "asc" }, { id: "asc" }], skip, take })).map((r) => r.id);
    const [firstCount, firstPage, secondPage] = dir === "asc" ? [noRowCount, noRowPage, summedPage] : [withCount, summedPage, noRowPage];
    const first = offset < firstCount ? await firstPage(offset, Math.min(PAGE_SIZE, firstCount - offset)) : [];
    const ids = [...first, ...(await secondPage(Math.max(0, offset - firstCount), PAGE_SIZE - first.length))];
    const found = await prisma.product.findMany({ where: { id: { in: ids } }, select });
    const byId = new Map(found.map((f) => [f.id, f]));
    products = ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    total = withCount + noRowCount;
  } else {
    // Lowest price counts only the branches that sell the product, as the
    // rows show it; every match is needed to sort by that.
    const all = await prisma.product.findMany({ where, select });
    const storeIds = new Set(stores.map((s) => s.id));
    // Same as the row: each selling branch's own price, else the base price.
    const key = (p: (typeof all)[number]) => {
      const hidden = new Set(p.stocks.filter((st) => st.isHidden).map((st) => st.storeId));
      const prices = [...storeIds]
        .filter((id) => !hidden.has(id))
        .map((id) => Number(p.stocks.find((st) => st.storeId === id)?.sellingPrice ?? p.sellingPrice));
      return prices.length ? Math.min(...prices) : Number(p.sellingPrice);
    };
    const sign = dir === "asc" ? 1 : -1;
    all.sort((a, b) => sign * (key(a) - key(b)) || a.name.localeCompare(b.name));
    total = all.length;
    products = all.slice(offset, offset + PAGE_SIZE);
  }

  return NextResponse.json({
    stores,
    total,
    pageSize: PAGE_SIZE,
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      minimumStock: p.minimumStock,
      byStore: Object.fromEntries(stores.map((s) => [s.id, p.stocks.find((st) => st.storeId === s.id)?.currentStock ?? 0])),
      basePrice: Number(p.sellingPrice),
      // Only branches with their own price appear here; the rest sell at basePrice.
      branchPrices: Object.fromEntries(
        p.stocks.filter((st) => st.sellingPrice != null).map((st) => [st.storeId, Number(st.sellingPrice)])
      ),
      notSoldAt: p.stocks.filter((st) => st.isHidden).map((st) => st.storeId),
    })),
  });
}

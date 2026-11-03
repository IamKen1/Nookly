import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Paging and sorting for product lists, so a catalog of thousands sends one
// page at a time instead of everything. Sorting covers the whole catalog, not
// just the page. Price is the product's base price, as the Products page shows.
export type ProductSort = "name" | "category" | "price" | "stock" | "minimum";

export function parseProductSort(params: URLSearchParams): { sort: ProductSort; dir: "asc" | "desc" } {
  const s = params.get("sort");
  const sort: ProductSort = s === "category" || s === "price" || s === "stock" || s === "minimum" ? s : "name";
  return { sort, dir: params.get("dir") === "desc" ? "desc" : "asc" };
}

// The ids for one page, in order, plus how many products match in total.
export async function productPageIds(
  where: Prisma.ProductWhereInput,
  storeId: string | null,
  { sort, dir }: { sort: ProductSort; dir: "asc" | "desc" },
  offset: number,
  limit: number
): Promise<{ ids: string[]; total: number }> {
  if (sort !== "stock" || !storeId) {
    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      sort === "category"
        ? [{ category: { name: dir } }, { name: "asc" }]
        : sort === "price"
          ? [{ sellingPrice: dir }, { name: "asc" }]
          : sort === "minimum"
            ? [{ minimumStock: dir }, { name: "asc" }]
            : [{ name: dir }];
    const [rows, total] = await Promise.all([
      prisma.product.findMany({ where, select: { id: true }, orderBy: [...orderBy, { id: "asc" }], skip: offset, take: limit }),
      prisma.product.count({ where }),
    ]);
    return { ids: rows.map((r) => r.id), total };
  }

  // Stock lives on each branch's own row, so the page is ordered there. A
  // product with no row at this branch has 0 in stock: those come first going
  // up and last going down.
  const withRow: Prisma.ProductStockWhereInput = { storeId, product: where };
  const noRow: Prisma.ProductWhereInput = { AND: [where, { stocks: { none: { storeId } } }] };
  const [rowCount, noRowCount] = await Promise.all([prisma.productStock.count({ where: withRow }), prisma.product.count({ where: noRow })]);
  const rowPage = async (skip: number, take: number) =>
    take <= 0
      ? []
      : (
          await prisma.productStock.findMany({
            where: withRow,
            select: { productId: true },
            orderBy: [{ currentStock: dir }, { product: { name: "asc" } }, { productId: "asc" }],
            skip,
            take,
          })
        ).map((r) => r.productId);
  const noRowPage = async (skip: number, take: number) =>
    take <= 0 ? [] : (await prisma.product.findMany({ where: noRow, select: { id: true }, orderBy: [{ name: "asc" }, { id: "asc" }], skip, take })).map((r) => r.id);

  const [firstCount, firstPage, secondPage] = dir === "asc" ? [noRowCount, noRowPage, rowPage] : [rowCount, rowPage, noRowPage];
  const first = offset < firstCount ? await firstPage(offset, Math.min(limit, firstCount - offset)) : [];
  const second = await secondPage(Math.max(0, offset - firstCount), limit - first.length);
  return { ids: [...first, ...second], total: rowCount + noRowCount };
}

// Reads ?limit / ?offset, capped so no request asks for an unbounded page.
export function parsePage(params: URLSearchParams, max = 200): { offset: number; limit: number } | null {
  if (!params.has("limit")) return null;
  const limit = Math.min(max, Math.max(1, Math.trunc(Number(params.get("limit"))) || 50));
  const offset = Math.max(0, Math.trunc(Number(params.get("offset"))) || 0);
  return { offset, limit };
}

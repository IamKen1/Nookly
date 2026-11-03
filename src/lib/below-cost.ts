import { prisma } from "@/lib/prisma";

// Active products that sell at or below their cost: the product's own price,
// or a branch's own price, isn't above the cost price. Saving such a price is
// refused now, but older products (and costs raised by a later delivery) can
// still be like this, so owners are told and can fix them.
export async function belowCostProductIds(tenantId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT pr.id FROM products pr
    WHERE pr."tenantId" = ${tenantId} AND pr."isActive" = true
      AND (
        pr."sellingPrice" <= pr."costPrice"
        OR EXISTS (
          SELECT 1 FROM product_stocks ps JOIN stores s ON s.id = ps."storeId"
          WHERE ps."productId" = pr.id AND s."isActive" = true AND ps."isHidden" = false
            AND ps."sellingPrice" IS NOT NULL AND ps."sellingPrice" <= pr."costPrice"
        )
      )`;
  return rows.map((r) => r.id);
}

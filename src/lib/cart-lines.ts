import { prisma } from "@/lib/prisma";

export interface CartLineData {
  productId: string;
  name: string;
  strength: string | null;
  dosageForm: string | null;
  price: number;
  quantity: number;
  currentStock: number;
  isVatable: boolean;
  requiresPrescription: boolean;
}

// Turns saved { productId, quantity } lines (a held cart, a prescription) into
// POS cart lines at today's price and this branch's stock. Products that were
// removed or aren't sold at this branch are left out.
export async function resolveCartLines(tenantId: string, storeId: string, items: { productId: string; quantity: number }[]): Promise<CartLineData[]> {
  if (items.length === 0) return [];
  const products = await prisma.product.findMany({
    where: { id: { in: [...new Set(items.map((i) => i.productId))] }, tenantId, isActive: true },
    select: {
      id: true,
      name: true,
      strength: true,
      dosageForm: true,
      sellingPrice: true,
      isVatable: true,
      requiresPrescription: true,
      stocks: { where: { storeId }, select: { currentStock: true, sellingPrice: true, isHidden: true } },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  return items.flatMap((i) => {
    const p = byId.get(i.productId);
    if (!p || p.stocks[0]?.isHidden) return [];
    return [
      {
        productId: p.id,
        name: p.name,
        strength: p.strength,
        dosageForm: p.dosageForm,
        price: Number(p.stocks[0]?.sellingPrice ?? p.sellingPrice),
        quantity: i.quantity,
        currentStock: p.stocks[0]?.currentStock ?? 0,
        isVatable: p.isVatable,
        requiresPrescription: p.requiresPrescription,
      },
    ];
  });
}

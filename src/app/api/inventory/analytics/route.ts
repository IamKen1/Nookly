import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { getBranchContext } from "@/lib/branch-scope";
import { inventoryAnalytics, type InventoryTab } from "@/lib/inventory-analytics";

const TABS: InventoryTab[] = ["stock", "receiving", "batches", "movements", "branches"];

// Analytics for the Inventory tab that's open: the user's branch, or every
// branch on the All branches tab.
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.tenantId, session.role, "inventory"))) {
    return NextResponse.json({ error: "You don't have access to Inventory." }, { status: 403 });
  }
  const tab = new URL(request.url).searchParams.get("tab") as InventoryTab;
  if (!TABS.includes(tab)) return NextResponse.json({ error: "Unknown tab." }, { status: 400 });

  let storeId: string | null = session.storeId;
  if (tab === "branches") {
    // The All branches tab only exists when there's more than one branch.
    const ctx = await getBranchContext(session);
    if (!ctx.isMultiBranch) return NextResponse.json({ error: "Only one branch." }, { status: 400 });
    storeId = null;
  } else if (!storeId) {
    return NextResponse.json({ error: "No branch assigned to this account." }, { status: 400 });
  }

  return NextResponse.json(await inventoryAnalytics(session.tenantId, storeId, tab));
}

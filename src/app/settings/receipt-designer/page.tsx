import { redirect } from "next/navigation";
import { requirePagePermission } from "@/lib/require-session";
import ReceiptDesigner from "@/components/receipt-designer/ReceiptDesigner";

// Full-screen editor for the owner's own receipt (Settings › Receipt designer).
// The plan check happens in the API; without it the editor explains how to unlock it.
export default async function ReceiptDesignerPage() {
  const session = await requirePagePermission("settings", { active: false });
  if (session.role !== "OWNER") redirect("/settings");
  return <ReceiptDesigner />;
}

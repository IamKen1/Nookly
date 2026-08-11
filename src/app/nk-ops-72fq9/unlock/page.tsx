import { redirect } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { isPlatformAdmin } from "@/lib/platform-admin";
import UnlockClient from "@/components/admin/UnlockClient";

export default async function AdminUnlockPage() {
  const session = await requireSession();
  const admin = await isPlatformAdmin(session);
  if (!admin.ok) redirect("/dashboard");

  return <UnlockClient />;
}

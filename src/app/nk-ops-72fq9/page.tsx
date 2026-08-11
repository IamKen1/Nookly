import { redirect } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { requireAdminAccessServer } from "@/lib/platform-admin";
import AdminConsoleClient from "@/components/admin/AdminConsoleClient";

export default async function AdminConsolePage() {
  const session = await requireSession();
  const access = await requireAdminAccessServer(session);

  if (access.reason === "not-admin") redirect("/dashboard");
  if (access.reason === "locked") redirect("/nk-ops-72fq9/unlock");

  return <AdminConsoleClient adminEmail={access.email ?? ""} />;
}

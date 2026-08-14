import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import type { SessionPayload } from "@/lib/auth";
import { getSubscriptionLapse } from "@/lib/subscription-access";

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

// Use on tenant-operational pages (POS, products, inventory, sales, etc.) that
// should be unreachable once a trial or renewal has lapsed. Do NOT use on
// /settings, /upgrade, or any admin (nk-ops) page — those must stay reachable
// for a locked-out tenant to see why and pay, and for platform admins whose
// own tenant subscription state is irrelevant to running the ops console.
export async function requireActiveSession(): Promise<SessionPayload> {
  const session = await requireSession();
  const lapse = await getSubscriptionLapse(session.tenantId);
  if (lapse) {
    redirect(`/upgrade?reason=${lapse.reason}`);
  }
  return session;
}

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import type { SessionPayload } from "@/lib/auth";
import { getSubscriptionLapse } from "@/lib/subscription-access";
import { getRolePermissions, type PermissionModuleKey } from "@/lib/permissions";
import { homePathFor } from "@/lib/permissions-shared";

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

// Page guard for a module page: anyone whose role isn't allowed that module is
// sent to the first module they can use (or a no-access page if none).
// `active: false` skips the lapsed-subscription check, for pages that must stay
// reachable then (Settings, Support).
export async function requirePagePermission(
  module: PermissionModuleKey,
  { active = true }: { active?: boolean } = {}
): Promise<SessionPayload> {
  const session = await requireSession();
  // The lapse check and the permission lookup are independent reads, so both
  // start at once (one DB wave instead of two). The redirect order is
  // unchanged: a lapsed subscription wins over a missing module permission,
  // and a lapse redirects even if the permission read fails.
  const permissionsPromise = getRolePermissions(session.tenantId, session.role);
  if (active) {
    permissionsPromise.catch(() => {}); // surfaced below by the await; avoids an unhandled rejection if we redirect first
    const lapse = await getSubscriptionLapse(session.tenantId);
    if (lapse) {
      redirect(`/upgrade?reason=${lapse.reason}`);
    }
  }
  const permissions = await permissionsPromise;
  if (!permissions[module]) {
    const home = homePathFor(permissions);
    redirect(home ?? "/no-access");
  }
  return session;
}

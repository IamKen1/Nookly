import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getRolePermissions } from "@/lib/permissions";
import { getTenantPlanCode } from "@/lib/plan-gating";

// Staff security codes (Empire plan, 2+ branches). A shared login can be used
// by anyone at the counter, so whoever sends an order or completes a sale
// enters their own code and is on record for it.

const SECRET = process.env.STAFF_CODE_SECRET || process.env.JWT_SECRET || "dev-secret-change-me";
const MAX_WRONG = 5;
const WRONG_WINDOW_MS = 5 * 60 * 1000;

export const STAFF_CODE_PATTERN = /^\d{4,6}$/;

// Keyed hash, so a code can be looked up (and kept unique) but never read back.
export function hashStaffCode(tenantId: string, code: string): string {
  return crypto.createHmac("sha256", SECRET).update(`${tenantId}:${code}`).digest("hex");
}

// The plan includes it and the workspace has more than one branch.
export async function staffCodeAvailable(tenantId: string): Promise<boolean> {
  const code = await getTenantPlanCode(tenantId);
  if (!code) return false;
  const [plan, branches] = await Promise.all([
    prisma.plan.findUnique({ where: { code }, select: { featureStaffCode: true } }),
    prisma.store.count({ where: { tenantId, isActive: true } }),
  ]);
  return Boolean(plan?.featureStaffCode) && branches > 1;
}

// Available, and turned on by the owner (Settings › User access).
export async function staffCodeRequired(tenantId: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { requireStaffCode: true } });
  if (!tenant?.requireStaffCode) return false;
  return staffCodeAvailable(tenantId);
}

// For saving a code on a user: format, and not already someone else's.
export async function checkNewStaffCode(tenantId: string, code: string, userId?: string): Promise<{ hash: string } | { error: string; status: number }> {
  if (!STAFF_CODE_PATTERN.test(code)) return { error: "The security code must be 4 to 6 digits.", status: 400 };
  const hash = hashStaffCode(tenantId, code);
  const taken = await prisma.user.findFirst({ where: { tenantId, staffCodeHash: hash, ...(userId ? { id: { not: userId } } : {}) }, select: { id: true } });
  if (taken) return { error: "That security code is already used by another user. Choose a different one.", status: 409 };
  return { hash };
}

type Action = "send" | "checkout";

// Who entered this code at this account's counter. Wrong codes are counted
// per account, and after 5 in 5 minutes the counter waits before trying again.
export async function identifyStaff(
  tenantId: string,
  accountUserId: string,
  code: unknown,
  action: Action
): Promise<{ user: { id: string; name: string } } | { error: string; status: number }> {
  const attemptKey = crypto.createHash("sha256").update(`staffcode:${accountUserId}`).digest("hex");
  const wrong = await prisma.loginAttempt.count({ where: { accountKeyHash: attemptKey, createdAt: { gte: new Date(Date.now() - WRONG_WINDOW_MS) } } });
  if (wrong >= MAX_WRONG) return { error: "Too many wrong security codes. Wait 5 minutes, then try again.", status: 429 };

  const entered = typeof code === "string" ? code.trim() : "";
  if (!entered) return { error: "Enter your security code.", status: 400 };
  const user = STAFF_CODE_PATTERN.test(entered)
    ? await prisma.user.findFirst({
        where: { tenantId, staffCodeHash: hashStaffCode(tenantId, entered), isActive: true },
        select: { id: true, firstName: true, lastName: true, role: true },
      })
    : null;
  if (!user) {
    await prisma.loginAttempt.create({ data: { accountKeyHash: attemptKey, ip: null } });
    return { error: "Wrong security code.", status: 401 };
  }

  const name = `${user.firstName} ${user.lastName}`.trim();
  const perms = await getRolePermissions(tenantId, user.role);
  const allowed = action === "send" ? perms.pos && perms.pos_send_to_cashier : perms.pos && perms.pos_checkout;
  if (!allowed) {
    return { error: action === "send" ? `${name} isn't allowed to send orders to the cashier.` : `${name} isn't allowed to take payment.`, status: 403 };
  }
  return { user: { id: user.id, name } };
}

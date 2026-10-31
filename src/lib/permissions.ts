import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  CONFIGURABLE_ROLES,
  DEFAULT_PERMISSIONS,
  PERMISSION_MODULES,
  isConfigurableRole,
  type ConfigurableRole,
  type PermissionMatrix,
  type PermissionModuleKey,
} from "@/lib/permissions-shared";

export {
  PERMISSION_MODULES,
  isConfigurableRole,
  type ConfigurableRole,
  type PermissionMatrix,
  type PermissionModuleKey,
};

// OWNER always has every permission — this is not configurable and never
// stored, so an owner can never lock themselves out of their own workspace.
// A finer control (e.g. "Void / return sales") only counts when its module
// ("Sales") is also allowed, so unticking a module switches off everything in it.
export const hasPermission = async (tenantId: string, role: string, module: PermissionModuleKey): Promise<boolean> => {
  if (role === "OWNER") return true;
  if (!isConfigurableRole(role)) return false;
  return (await getRolePermissions(tenantId, role))[module];
};

// Resolves every module for one role in a single query — for call sites
// (e.g. the sidebar) that need several checks at once.
export const getRolePermissions = async (tenantId: string, role: string): Promise<Record<PermissionModuleKey, boolean>> => {
  const raw = {} as Record<PermissionModuleKey, boolean>;
  const allTrue = role === "OWNER";
  const defaults = isConfigurableRole(role) ? DEFAULT_PERMISSIONS[role] : [];

  const overrides = isConfigurableRole(role) ? await prisma.rolePermission.findMany({ where: { tenantId, role } }) : [];
  const overrideMap = new Map(overrides.map((o) => [o.module, o.allowed]));

  for (const { key } of PERMISSION_MODULES) {
    raw[key] = allTrue || (overrideMap.get(key) ?? (defaults as readonly string[]).includes(key));
  }
  const result = { ...raw };
  for (const { key, parent } of PERMISSION_MODULES) {
    if (parent && !raw[parent]) result[key] = false;
  }
  return result;
};

// Builds the full role x module grid for the Settings UI, merging any saved
// overrides on top of the defaults above.
export const getPermissionMatrix = async (tenantId: string): Promise<PermissionMatrix> => {
  const overrides = await prisma.rolePermission.findMany({ where: { tenantId } });
  const overrideMap = new Map(overrides.map((o) => [`${o.role}:${o.module}`, o.allowed]));

  const matrix = {} as PermissionMatrix;
  for (const role of CONFIGURABLE_ROLES) {
    matrix[role] = {} as Record<PermissionModuleKey, boolean>;
    for (const { key } of PERMISSION_MODULES) {
      const override = overrideMap.get(`${role}:${key}`);
      matrix[role][key] = override ?? (DEFAULT_PERMISSIONS[role] as readonly string[]).includes(key);
    }
  }
  return matrix;
};

// Replaces the tenant's entire permission matrix in one go — simplest
// mental model for the owner ("Save" writes exactly what's checked), and
// cheap enough given the grid is at most 6 roles x 15 modules = 90 rows.
export const setPermissionMatrix = async (tenantId: string, matrix: PermissionMatrix): Promise<void> => {
  const rows: { tenantId: string; role: ConfigurableRole; module: PermissionModuleKey; allowed: boolean }[] = [];
  for (const role of CONFIGURABLE_ROLES) {
    for (const { key } of PERMISSION_MODULES) {
      const allowed = Boolean(matrix[role]?.[key]);
      rows.push({ tenantId, role, module: key, allowed });
    }
  }

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { tenantId } }),
    prisma.rolePermission.createMany({ data: rows }),
  ]);
};

// Which sales a role may see: everyone's or only those they rang up / took the
// order for, and every branch or only their own. Merge into any Sale query.
export const saleVisibilityWhere = async (session: {
  tenantId: string;
  role: string;
  userId: string;
  storeId: string | null;
}): Promise<Prisma.SaleWhereInput> => {
  const permissions = await getRolePermissions(session.tenantId, session.role);
  return {
    ...(permissions.sales_view_all ? {} : { OR: [{ userId: session.userId }, { orderTakerId: session.userId }] }),
    ...(permissions.all_branches || !session.storeId ? {} : { storeId: session.storeId }),
  };
};

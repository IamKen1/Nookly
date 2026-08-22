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
export const hasPermission = async (tenantId: string, role: string, module: PermissionModuleKey): Promise<boolean> => {
  if (role === "OWNER") return true;
  if (!isConfigurableRole(role)) return false;

  const override = await prisma.rolePermission.findUnique({
    where: { tenantId_role_module: { tenantId, role, module } },
  });
  if (override) return override.allowed;
  return DEFAULT_PERMISSIONS[role].includes(module);
};

// Like hasPermission, but resolves every module for one role in a single
// query — for call sites (e.g. the sidebar) that need several checks at
// once and shouldn't pay for a round trip per module.
export const getRolePermissions = async (tenantId: string, role: string): Promise<Record<PermissionModuleKey, boolean>> => {
  const result = {} as Record<PermissionModuleKey, boolean>;
  const allTrue = role === "OWNER";
  const defaults = isConfigurableRole(role) ? DEFAULT_PERMISSIONS[role] : [];

  const overrides = isConfigurableRole(role) ? await prisma.rolePermission.findMany({ where: { tenantId, role } }) : [];
  const overrideMap = new Map(overrides.map((o) => [o.module, o.allowed]));

  for (const { key } of PERMISSION_MODULES) {
    result[key] = allTrue || (overrideMap.get(key) ?? defaults.includes(key));
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
      matrix[role][key] = override ?? DEFAULT_PERMISSIONS[role].includes(key);
    }
  }
  return matrix;
};

// Replaces the tenant's entire permission matrix in one go — simplest
// mental model for the owner ("Save" writes exactly what's checked), and
// cheap enough given the grid is at most 5 roles x 6 modules = 30 rows.
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

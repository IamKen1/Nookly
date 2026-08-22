// Static constants only — no server-only imports (no Prisma) — so this file
// is safe to import from client components (the User Access settings form)
// as well as server code (src/lib/permissions.ts).

// The set of role-gated capabilities an owner can toggle per role from
// Settings > User Access. Keys are stable identifiers stored in the DB —
// never rename one without a migration, since existing RolePermission rows
// reference it by string.
export const PERMISSION_MODULES = [
  { key: "users", label: "Manage users", description: "Add, edit, deactivate staff accounts, and change roles" },
  { key: "shifts", label: "Shifts & cash reports", description: "View all cashiers' shifts, close others' shifts, view cash reports" },
  { key: "sales_void", label: "Void / return sales", description: "Cancel a completed sale or process a return" },
  { key: "inventory_adjust", label: "Adjust inventory", description: "Manually adjust stock counts and receive batches" },
  { key: "reports", label: "Reports", description: "View sales, inventory, and financial reports" },
  { key: "settings", label: "Settings", description: "Manage plan, notifications, and receipt settings" },
] as const;

export type PermissionModuleKey = (typeof PERMISSION_MODULES)[number]["key"];

export const CONFIGURABLE_ROLES = ["ADMIN", "MANAGER", "PHARMACIST", "PHARMACY_TECH", "CASHIER"] as const;
export type ConfigurableRole = (typeof CONFIGURABLE_ROLES)[number];
export const isConfigurableRole = (role: string): role is ConfigurableRole => (CONFIGURABLE_ROLES as readonly string[]).includes(role);

export const ROLE_LABELS: Record<ConfigurableRole, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  PHARMACIST: "Pharmacist",
  PHARMACY_TECH: "Pharmacy Tech",
  CASHIER: "Cashier",
};

// Includes OWNER (not a configurable role, but still needs a display label
// wherever the logged-in user's role is shown in the UI).
export const ALL_ROLE_LABELS: Record<string, string> = { OWNER: "Owner", ...ROLE_LABELS };

// Mirrors exactly what was hardcoded across the app before this system
// existed — so a tenant with no RolePermission rows yet behaves identically
// to the old behavior. Only an explicit row in the DB overrides this.
export const DEFAULT_PERMISSIONS: Record<ConfigurableRole, PermissionModuleKey[]> = {
  ADMIN: ["users", "shifts", "sales_void", "inventory_adjust", "reports", "settings"],
  MANAGER: ["shifts", "sales_void", "inventory_adjust", "reports"],
  PHARMACIST: ["inventory_adjust", "reports"],
  PHARMACY_TECH: ["reports"],
  // Reports viewing was never role-restricted before this system existed —
  // so it defaults to true even for cashier, to keep behavior unchanged
  // until the owner explicitly unchecks it.
  CASHIER: ["reports"],
};

export type PermissionMatrix = Record<ConfigurableRole, Record<PermissionModuleKey, boolean>>;

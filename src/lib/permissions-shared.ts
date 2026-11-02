// Static constants only — no server-only imports (no Prisma) — so this file
// is safe to import from client components (the User Access settings form)
// as well as server code (src/lib/permissions.ts).

// The modules of the app, in sidebar order, each with the finer controls that
// belong to it. An owner ticks per role which modules that role can use from
// Settings > User Access; an unticked module disappears from that role's menu
// and its pages and data are blocked. Keys are stable identifiers stored in the
// DB — never rename one without a migration, since existing RolePermission
// rows reference it by string.
export const PERMISSION_MODULES = [
  { key: "dashboard", parent: null, path: "/dashboard", label: "Dashboard", description: "Today's sales, stock alerts, and plan" },
  { key: "all_branches", parent: "dashboard", path: null, label: "See all branches", description: "Unticked: Dashboard and Sales show only their own branch" },
  { key: "pos", parent: null, path: "/pos", label: "POS", description: "Ring up sales, or send orders to a cashier" },
  { key: "pos_checkout", parent: "pos", path: null, label: "Checkout & collect payment", description: "Unticked: can build carts but not take payment (send them to a cashier instead)" },
  { key: "pos_send_to_cashier", parent: "pos", path: null, label: "Send to cashier", description: "Can send a cart to the cashier queue as an order, for someone else to collect payment" },
  { key: "pos_shift_required", parent: "pos", path: null, label: "Must start & end a shift", description: "Ticked: can't sell without an open shift, or log out without ending it" },
  { key: "products", parent: null, path: "/products", label: "Products", description: "Browse the product catalog" },
  { key: "products_edit", parent: "products", path: null, label: "Edit products & prices", description: "Add, edit, and delete products and their prices" },
  { key: "inventory", parent: null, path: "/inventory", label: "Inventory", description: "Stock levels, batches, movement history, and branch stock" },
  { key: "inventory_adjust", parent: "inventory", path: null, label: "Adjust inventory", description: "Adjust stock, receive batches, transfer and request stock" },
  { key: "suppliers", parent: null, path: "/suppliers", label: "Suppliers", description: "Supplier list, their deliveries, and returns to suppliers" },
  { key: "suppliers_pay", parent: "suppliers", path: null, label: "Payables & payments", description: "See what's owed to suppliers and record payments" },
  { key: "prescriptions", parent: null, path: "/prescriptions", label: "Prescriptions", description: "View and record prescriptions" },
  { key: "sales", parent: null, path: "/sales", label: "Sales", description: "Look up past sales and reprint receipts" },
  { key: "sales_view_all", parent: "sales", path: null, label: "See everyone's sales", description: "Unticked: only sales they rang up or took the order for" },
  { key: "sales_void", parent: "sales", path: null, label: "Void / return sales", description: "Cancel a completed sale or process a return and refund" },
  { key: "reports", parent: null, path: "/reports", label: "Reports", description: "Sales, inventory, and financial reports" },
  { key: "users", parent: null, path: "/users", label: "Users", description: "Add, edit, and deactivate staff accounts" },
  { key: "shifts", parent: null, path: "/shifts", label: "Shifts", description: "Every cashier's shifts and cash reports" },
  { key: "settings", parent: null, path: "/settings", label: "Settings", description: "Plan, branches, receipt, and notification settings" },
  { key: "support", parent: null, path: "/support", label: "Support", description: "Contact Nookly support and track tickets" },
] as const;

export type PermissionModuleKey = (typeof PERMISSION_MODULES)[number]["key"];

// The page a role lands on: the Dashboard if allowed, else its first allowed
// module, so a role without the Dashboard never bounces between pages.
export const homePathFor = (permissions: Record<PermissionModuleKey, boolean>): string | null =>
  PERMISSION_MODULES.find((m) => m.path && permissions[m.key])?.path ?? null;

// "Order taker" is no longer a role — any role can be allowed to send orders
// to a cashier (pos_send_to_cashier). ORDER_TAKER stays in the database enum
// only for history; such accounts are treated as cashiers.
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

export const ROLE_DESCRIPTIONS: Record<ConfigurableRole, string> = {
  ADMIN: "Runs the workspace with the owner",
  MANAGER: "Oversees a branch and its staff",
  PHARMACIST: "Dispenses medicine and manages stock",
  PHARMACY_TECH: "Assists the pharmacist",
  CASHIER: "Collects payment at the counter",
};

// Whether this user can check out and take payment at the POS. The owner
// always can; other roles unless "Checkout & collect payment" is unticked
// (e.g. someone who only prepares orders for the cashier).
export const canCollectPayment = (role: string, permissions: Partial<Record<PermissionModuleKey, boolean>>) =>
  role === "OWNER" || Boolean(permissions.pos_checkout);

// "Must start & end a shift" is a requirement, not an access right, so the
// owner (who otherwise has every permission) is never held to it, and order
// takers never handle the cash drawer. Off for every role unless ticked.
export const isShiftRequired = (role: string, permissions: Partial<Record<PermissionModuleKey, boolean>>) =>
  role !== "OWNER" && canCollectPayment(role, permissions) && Boolean(permissions.pos_shift_required);

// Philippine calendar day of an instant, to tell a shift left open from an earlier day.
export const phDayOf = (d: Date | string) => new Date(new Date(d).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);

// Includes OWNER (not a configurable role, but still needs a display label
// wherever the logged-in user's role is shown in the UI).
export const ALL_ROLE_LABELS: Record<string, string> = { OWNER: "Owner", ...ROLE_LABELS, ORDER_TAKER: "Cashier" };

// Used whenever a tenant hasn't saved its own choice for a role + permission.
// Front-counter roles (Cashier, Order Taker) start limited to their own work:
// their branch, their own sales, no settings or support tickets — the owner
// can open up more from Settings > User Access.
export const DEFAULT_PERMISSIONS: Record<ConfigurableRole, PermissionModuleKey[]> = {
  ADMIN: [
    "dashboard", "all_branches", "pos", "pos_checkout", "products", "products_edit", "inventory", "inventory_adjust", "suppliers", "suppliers_pay",
    "prescriptions", "sales", "sales_view_all", "sales_void", "reports", "users", "shifts", "settings", "support",
  ],
  MANAGER: [
    "dashboard", "pos", "pos_checkout", "products", "products_edit", "inventory", "inventory_adjust", "suppliers", "prescriptions",
    "sales", "sales_view_all", "sales_void", "reports", "shifts", "support",
  ],
  PHARMACIST: ["dashboard", "pos", "pos_checkout", "products", "products_edit", "inventory", "inventory_adjust", "suppliers", "prescriptions", "sales", "sales_view_all", "reports"],
  PHARMACY_TECH: ["dashboard", "pos", "pos_checkout", "products", "inventory", "prescriptions", "sales", "sales_view_all", "reports"],
  CASHIER: ["dashboard", "pos", "pos_checkout", "products", "prescriptions", "sales", "reports"],
};

export type PermissionMatrix = Record<ConfigurableRole, Record<PermissionModuleKey, boolean>>;

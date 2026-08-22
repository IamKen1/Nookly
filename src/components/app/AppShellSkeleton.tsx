import { BarChart3, Boxes, ClipboardPlus, LayoutDashboard, Leaf, LifeBuoy, Package, Receipt, Settings, ShoppingCart, Users, Wallet } from "lucide-react";

// Mirrors AppShell's chrome so a route's loading.tsx never appears as a
// totally different blank screen — but without any tenant-specific data,
// since a loading.tsx fallback is shown instantly, before any Server
// Component has had the chance to fetch anything.
const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "POS", icon: ShoppingCart },
  { label: "Products", icon: Package },
  { label: "Inventory", icon: Boxes },
  { label: "Prescriptions", icon: ClipboardPlus },
  { label: "Sales", icon: Receipt },
  { label: "Reports", icon: BarChart3 },
  { label: "Users", icon: Users },
  { label: "Shifts", icon: Wallet },
  { label: "Settings", icon: Settings },
  { label: "Support", icon: LifeBuoy },
];

export default function AppShellSkeleton() {
  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="hidden w-56 shrink-0 border-r border-zinc-200 bg-white sm:flex sm:flex-col">
        <div className="flex items-center gap-2 px-5 py-5 font-bold text-zinc-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Leaf className="h-4.5 w-4.5" />
          </span>
          Nookly
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.map(({ label, icon: Icon }) => (
            <div key={label} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-zinc-300">
              <Icon className="h-4 w-4" />
              {label}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
          <span className="h-4 w-24 animate-pulse rounded bg-zinc-100" />
        </header>
        <main className="flex flex-1 items-center justify-center p-6">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent" />
        </main>
      </div>
    </div>
  );
}

import Link from "next/link";
import { BarChart3, Boxes, ClipboardPlus, LayoutDashboard, Leaf, LifeBuoy, Package, Receipt, Settings, ShoppingCart, Users, Wallet } from "lucide-react";
import LogoutButton from "./LogoutButton";
import OnboardingTourLoader from "@/components/onboarding/OnboardingTourLoader";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pos", label: "POS", icon: ShoppingCart },
  { href: "/products", label: "Products", icon: Package },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/prescriptions", label: "Prescriptions", icon: ClipboardPlus },
  { href: "/sales", label: "Sales", icon: Receipt },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/users", label: "Users", icon: Users, roles: ["OWNER", "ADMIN"] },
  { href: "/shifts", label: "Shifts", icon: Wallet, roles: ["OWNER", "ADMIN", "MANAGER"] },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/support", label: "Support", icon: LifeBuoy },
];

export default function AppShell({
  tenantName,
  planName,
  role,
  children,
}: {
  tenantName: string;
  planName?: string;
  role?: string;
  children: React.ReactNode;
}) {
  const visibleItems = navItems.filter((item) => !item.roles || (role && item.roles.includes(role)));

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="hidden w-56 shrink-0 border-r border-zinc-200 bg-white sm:flex sm:flex-col">
        <Link href="/" className="flex items-center gap-2 px-5 py-5 font-bold text-zinc-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Leaf className="h-4.5 w-4.5" />
          </span>
          Nookly
        </Link>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {visibleItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              data-tour={`nav-${href.slice(1)}`}
              className="btn-press flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-emerald-50 hover:text-emerald-700"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-zinc-100 px-5 py-4 text-xs text-zinc-400">
          {planName ? `${planName} plan` : null}
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
          <span className="text-sm font-medium text-zinc-700">{tenantName}</span>
          <LogoutButton />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>

      <OnboardingTourLoader role={role} />
    </div>
  );
}

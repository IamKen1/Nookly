"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Grid,
  List,
  Plus,
  LayoutDashboard,
  Leaf,
  LogOut,
  Menu,
  Package,
  Boxes,
  ClipboardPlus,
  Receipt,
  BarChart3,
  Users,
  Settings,
  ShoppingCart,
  Wallet,
  Banknote,
} from "lucide-react";
import { useBarcode } from "@/hooks/useBarcode";
import { useBarcodeAudio } from "@/hooks/useBarcodeAudio";
import { getImageUrl, getOptimizedImageUrl } from "@/lib/cloudinary";
import { peso } from "@/lib/format";
import type { DiscountType } from "@/lib/vat-calculations";
import CartPanel, { type CartLine } from "./CartPanel";
import CheckoutModal, { type PrescriptionDraft } from "./CheckoutModal";
import ShiftModal from "./ShiftModal";
import CashTransactionModal from "./CashTransactionModal";

interface Product {
  id: string;
  name: string;
  genericName: string | null;
  brandName: string | null;
  strength: string | null;
  dosageForm: string | null;
  barcode: string | null;
  sellingPrice: string;
  currentStock: number;
  minimumStock: number;
  isVatable: boolean;
  imageUrl: string | null;
  requiresPrescription: boolean;
  category: { id: string; name: string };
}

interface Category {
  id: string;
  name: string;
}

interface PendingPrescription {
  id: string;
  prescriptionNumber: string;
  customer: { firstName: string; lastName: string };
}

type ViewMode = "grid" | "list";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/products", label: "Products", icon: Package },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/prescriptions", label: "Prescriptions", icon: ClipboardPlus },
  { href: "/sales", label: "Sales", icon: Receipt },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/users", label: "Users", icon: Users, roles: ["OWNER", "ADMIN"] },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function PosClient({
  categories,
  tenantName,
  planName,
  role,
}: {
  categories: Category[];
  tenantName: string;
  planName?: string;
  role?: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const visibleNavItems = NAV_ITEMS.filter((item) => !item.roles || (role && item.roles.includes(role)));
  const [pendingPrescriptions, setPendingPrescriptions] = useState<PendingPrescription[]>([]);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error"; visible: boolean }>({
    message: "",
    type: "success",
    visible: false,
  });
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [cashTxnModalOpen, setCashTxnModalOpen] = useState(false);
  const [hasOpenShift, setHasOpenShift] = useState<boolean | null>(null);
  const [openShiftId, setOpenShiftId] = useState<string | null>(null);

  const refreshShiftStatus = useCallback(() => {
    fetch("/api/shifts?mine=true")
      .then((r) => r.json())
      .then((data) => {
        setHasOpenShift(Boolean(data.openShift));
        setOpenShiftId(data.openShift?.id ?? null);
      })
      .catch(() => {
        setHasOpenShift(null);
        setOpenShiftId(null);
      });
  }, []);

  useEffect(() => {
    refreshShiftStatus();
  }, [refreshShiftStatus]);

  const loadProducts = useCallback(async (q: string) => {
    setLoading(true);
    const url = q ? `/api/products?search=${encodeURIComponent(q)}` : "/api/products";
    const res = await fetch(url);
    const data = await res.json();
    setProducts(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadProducts(search), search ? 250 : 0);
    return () => clearTimeout(t);
  }, [search, loadProducts]);

  const showNotification = (message: string, type: "success" | "error") => {
    setNotification({ message, type, visible: true });
    setTimeout(() => setNotification((prev) => ({ ...prev, visible: false })), 2500);
  };

  const addToCart = useCallback((product: Product) => {
    if (product.currentStock <= 0) {
      showNotification(`${product.name} is out of stock`, "error");
      return;
    }
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.currentStock) return prev;
        return prev.map((l) => (l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          strength: product.strength,
          dosageForm: product.dosageForm,
          price: Number(product.sellingPrice),
          quantity: 1,
          maxStock: product.currentStock,
          isVatable: product.isVatable,
          requiresPrescription: product.requiresPrescription,
        },
      ];
    });
    showNotification(`Added ${product.name} to cart`, "success");
  }, []);

  const { playSuccessBeep, playErrorBeep } = useBarcodeAudio();
  const { lookupProduct } = useBarcode<Product>({
    products,
    onProductFound: (product) => {
      if (product.currentStock <= 0) {
        playErrorBeep();
        showNotification(`${product.name} is out of stock`, "error");
      } else {
        playSuccessBeep();
        addToCart(product);
      }
    },
    onProductNotFound: (barcode) => {
      playErrorBeep();
      showNotification(`Product not found: ${barcode}`, "error");
    },
  });

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !search.trim()) return;
    e.preventDefault();
    lookupProduct(search.trim());
  };

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.productId === productId ? { ...l, quantity: Math.max(0, Math.min(l.maxStock, l.quantity + delta)) } : l))
        .filter((l) => l.quantity > 0)
    );
  };

  const setQty = (productId: string, quantity: number) => {
    setCart((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, quantity: Math.max(1, Math.min(l.maxStock, quantity)) } : l))
    );
  };

  const removeLine = (productId: string) => setCart((prev) => prev.filter((l) => l.productId !== productId));
  const clearCart = () => setCart([]);

  const filteredProducts = useMemo(
    () => products.filter((p) => !selectedCategory || p.category.id === selectedCategory),
    [products, selectedCategory]
  );

  const vatableTotal = cart.filter((l) => l.isVatable).reduce((sum, l) => sum + l.price * l.quantity, 0);
  const nonVatableTotal = cart.filter((l) => !l.isVatable).reduce((sum, l) => sum + l.price * l.quantity, 0);
  const vatAmount = (vatableTotal * 12) / 112;
  const vatableSales = vatableTotal - vatAmount;
  const subtotal = vatableTotal + nonVatableTotal;

  const needsPrescription = cart.some((l) => l.requiresPrescription);

  useEffect(() => {
    if (!needsPrescription) {
      setPendingPrescriptions([]);
      return;
    }
    fetch("/api/prescriptions?status=PENDING")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setPendingPrescriptions(Array.isArray(data) ? data : []))
      .catch(() => setPendingPrescriptions([]));
  }, [needsPrescription]);

  const handleProcessSale = async (payload: {
    paymentMethod: string;
    cashReceived?: number;
    discountType?: DiscountType;
    orderRemarks?: string;
    prescriptionId?: string;
    prescriptionDraft?: PrescriptionDraft;
  }) => {
    const res = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity, price: l.price })),
        ...payload,
      }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error ?? "Checkout failed." };
    clearCart();
    loadProducts(search);
    return { ok: true, saleNumber: data.saleNumber, totalAmount: Number(data.totalAmount) };
  };

  return (
    <div className="fixed inset-0 flex h-screen w-screen flex-col overflow-hidden bg-gray-50">
      <header className="z-20 flex h-14 shrink-0 items-center justify-between bg-emerald-700 px-4 text-white">
        <div className="flex items-center gap-3">
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 transition-colors hover:bg-white/25"
              title="Menu"
            >
              <Menu className="h-4.5 w-4.5" />
            </button>
            {menuOpen && (
              <div className="absolute left-0 top-full z-30 mt-2 w-52 overflow-hidden rounded-xl border border-gray-100 bg-white py-1.5 text-gray-700 shadow-xl">
                <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-600 text-white">
                    <Leaf className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-xs font-semibold text-gray-900">Nookly</span>
                </div>
                {visibleNavItems.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ))}
                <div className="mt-1 border-t border-gray-100 pt-1">
                  <button
                    onClick={async () => {
                      await fetch("/api/auth/logout", { method: "POST" });
                      router.push("/login");
                      router.refresh();
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Log out
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold">{tenantName}</p>
            <p className="text-[11px] text-emerald-200">{planName ? `${planName} plan` : "Point of Sale"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShiftModalOpen(true)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              hasOpenShift ? "bg-white/15 text-white hover:bg-white/25" : "text-emerald-100 hover:bg-white/10"
            }`}
          >
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">{hasOpenShift ? "Shift open" : "Start shift"}</span>
          </button>
          <button
            onClick={() => setCashTxnModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-emerald-100 transition-colors hover:bg-white/10"
          >
            <Banknote className="h-4 w-4" />
            <span className="hidden sm:inline">Cash In/Out</span>
          </button>
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-emerald-100 transition-colors hover:bg-white/10"
          >
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="z-10 shrink-0 border-b border-gray-200 bg-white p-3 shadow-sm md:p-4">
          <div className="mb-2.5 flex items-center gap-2 md:mb-3 md:gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search products or scan barcode..."
                className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex shrink-0 items-center gap-1 rounded-xl border border-gray-300 bg-white p-1">
              <button
                onClick={() => setViewMode("grid")}
                className={`rounded-lg p-1.5 transition-colors ${viewMode === "grid" ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}
              >
                <Grid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`rounded-lg p-1.5 transition-colors ${viewMode === "list" ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin">
            <button
              onClick={() => setSelectedCategory("")}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors md:text-sm ${
                !selectedCategory ? "bg-emerald-600 text-white shadow-sm" : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              All Products
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors md:text-sm ${
                  selectedCategory === c.id ? "bg-emerald-600 text-white shadow-sm" : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-4">
          {loading ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:gap-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-xl border border-gray-100 bg-white p-2.5">
                  <div className="mb-2 aspect-square rounded-lg bg-gray-100" />
                  <div className="mb-1.5 h-3 rounded bg-gray-100" />
                  <div className="mb-2 h-3 w-2/3 rounded bg-gray-100" />
                  <div className="h-7 rounded-lg bg-gray-100" />
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-16 text-center">
              <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-50">
                <Search className="h-12 w-12 text-emerald-300" />
              </div>
              <h3 className="mb-2 text-xl font-semibold text-gray-900">No products found</h3>
              <p className="mb-6 text-gray-500">Try adjusting your search terms or category filters</p>
              <button
                onClick={() => {
                  setSearch("");
                  setSelectedCategory("");
                }}
                className="rounded-xl bg-emerald-600 px-6 py-3 font-medium text-white transition-colors hover:bg-emerald-700"
              >
                Clear Filters
              </button>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:gap-3 lg:grid-cols-4 xl:grid-cols-5">
              {filteredProducts.map((p) => (
                <ProductCard key={p.id} product={p} onAddToCart={addToCart} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredProducts.map((p) => (
                <ProductListItem key={p.id} product={p} onAddToCart={addToCart} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="hidden h-full w-80 shrink-0 md:block xl:w-96">
        <CartPanel
          cart={cart}
          onUpdateQty={updateQty}
          onSetQty={setQty}
          onRemove={removeLine}
          onClear={clearCart}
          onOpenCheckout={() => setShowCheckout(true)}
          subtotal={subtotal}
          vatableSales={vatableSales}
          vatAmount={vatAmount}
          nonVatableSales={nonVatableTotal}
        />
      </div>
      </div>

      {/* Mobile-only: floating cart button */}
      <button
        onClick={() => setMobileCartOpen(true)}
        className="fixed bottom-4 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition-transform hover:scale-105 md:hidden"
      >
        <ShoppingCart className="h-6 w-6" />
        {cart.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white">
            {cart.reduce((sum, l) => sum + l.quantity, 0) > 9 ? "9+" : cart.reduce((sum, l) => sum + l.quantity, 0)}
          </span>
        )}
      </button>

      {/* Mobile-only: cart bottom sheet */}
      <div
        className={`fixed inset-0 z-30 bg-black/40 transition-opacity md:hidden ${mobileCartOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => setMobileCartOpen(false)}
      />
      <div
        className={`fixed inset-x-0 bottom-0 z-40 max-h-[85vh] rounded-t-3xl bg-white shadow-2xl transition-transform md:hidden ${
          mobileCartOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex justify-center pb-1 pt-2">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>
        <div className="max-h-[calc(85vh-16px)]">
          <CartPanel
            cart={cart}
            onUpdateQty={updateQty}
            onSetQty={setQty}
            onRemove={removeLine}
            onClear={clearCart}
            onOpenCheckout={() => {
              setMobileCartOpen(false);
              setShowCheckout(true);
            }}
            subtotal={subtotal}
            vatableSales={vatableSales}
            vatAmount={vatAmount}
            nonVatableSales={nonVatableTotal}
          />
        </div>
      </div>

      <CheckoutModal
        isOpen={showCheckout}
        onClose={() => setShowCheckout(false)}
        cart={cart}
        needsPrescription={needsPrescription}
        pendingPrescriptions={pendingPrescriptions}
        onProcessSale={handleProcessSale}
      />

      <ShiftModal
        isOpen={shiftModalOpen}
        onClose={() => setShiftModalOpen(false)}
        onShiftChanged={refreshShiftStatus}
      />

      <CashTransactionModal
        isOpen={cashTxnModalOpen}
        onClose={() => setCashTxnModalOpen(false)}
        shiftId={openShiftId}
        onLogged={() => {}}
      />

      {notification.visible && (
        <div
          className={`fixed right-6 top-6 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
            notification.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {notification.message}
        </div>
      )}
    </div>
  );
}

const StockBadge = ({ isOutOfStock, isLowStock }: { isOutOfStock: boolean; isLowStock: boolean }) => {
  if (isOutOfStock) {
    return (
      <span className="absolute right-1.5 top-1.5 rounded-full bg-gray-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
        Out of stock
      </span>
    );
  }
  if (isLowStock) {
    return (
      <span className="absolute right-1.5 top-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">Low stock</span>
    );
  }
  return null;
};

const ProductCard = memo(({ product, onAddToCart }: { product: Product; onAddToCart: (product: Product) => void }) => {
  const isOutOfStock = product.currentStock <= 0;
  const isLowStock = product.currentStock > 0 && product.currentStock <= product.minimumStock;
  const details = [product.strength, product.dosageForm].filter(Boolean).join(" • ");

  return (
    <div
      className={`flex h-full flex-col rounded-xl border bg-white p-2.5 shadow-sm transition-all hover:shadow-md ${
        isOutOfStock ? "opacity-60" : ""
      } ${isLowStock ? "border-amber-200" : "border-gray-100 hover:border-emerald-200"}`}
    >
      <div className="relative mb-2 aspect-square overflow-hidden rounded-lg bg-linear-to-br from-gray-100 to-gray-200">
        {product.imageUrl ? (
          <img
            src={getOptimizedImageUrl(getImageUrl(product.imageUrl), { width: 220, height: 220, quality: 78, crop: "fill" })}
            alt={product.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xl font-bold text-gray-400">
            {product.name.charAt(0).toUpperCase()}
          </div>
        )}
        <StockBadge isOutOfStock={isOutOfStock} isLowStock={isLowStock} />
      </div>

      <h3 className="line-clamp-2 min-h-8 text-xs font-semibold leading-tight text-gray-900" title={product.name}>
        {product.name}
      </h3>
      {details && <p className="mt-0.5 line-clamp-1 text-[11px] font-medium text-emerald-600">{details}</p>}

      <div className="mt-1.5 flex items-baseline justify-between">
        <span className="text-sm font-bold text-emerald-700">{peso(Number(product.sellingPrice))}</span>
        <span className="text-[11px] text-gray-400">Stk {product.currentStock}</span>
      </div>

      {isOutOfStock ? (
        <div className="mt-2 w-full rounded-lg bg-gray-100 py-1.5 text-center">
          <span className="text-xs font-medium text-gray-500">Unavailable</span>
        </div>
      ) : (
        <button
          onClick={() => onAddToCart(product)}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-emerald-600 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      )}
    </div>
  );
});
ProductCard.displayName = "ProductCard";

const ProductListItem = memo(({ product, onAddToCart }: { product: Product; onAddToCart: (product: Product) => void }) => {
  const isOutOfStock = product.currentStock <= 0;
  const isLowStock = product.currentStock > 0 && product.currentStock <= product.minimumStock;
  const details = [product.strength, product.dosageForm].filter(Boolean).join(" • ");

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm transition-all hover:shadow-md ${
        isOutOfStock ? "opacity-60" : ""
      } ${isLowStock ? "border-amber-200" : "border-gray-100 hover:border-emerald-200"}`}
    >
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-linear-to-br from-gray-100 to-gray-200">
        {product.imageUrl ? (
          <img
            src={getOptimizedImageUrl(getImageUrl(product.imageUrl), { width: 150, height: 150, quality: 75, crop: "fill" })}
            alt={product.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-base font-bold text-gray-400">
            {product.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-gray-900">{product.name}</h3>
        <p className="truncate text-xs text-gray-500">{[product.genericName, details].filter(Boolean).join(" · ") || " "}</p>
      </div>

      <div className="hidden shrink-0 text-right sm:block">
        <p className="text-sm font-bold text-emerald-700">{peso(Number(product.sellingPrice))}</p>
        <p className="text-xs text-gray-400">Stock {product.currentStock}</p>
      </div>

      {isLowStock && <span className="hidden shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 md:inline">Low</span>}

      {isOutOfStock ? (
        <div className="shrink-0 rounded-lg bg-gray-100 px-3 py-2 text-center">
          <span className="text-xs font-medium text-gray-500">Unavailable</span>
        </div>
      ) : (
        <button
          onClick={() => onAddToCart(product)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Add</span>
        </button>
      )}
    </div>
  );
});
ProductListItem.displayName = "ProductListItem";

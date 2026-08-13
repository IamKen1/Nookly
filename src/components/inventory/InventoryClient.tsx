"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { AlertTriangle, Download, PackagePlus, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/format";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

interface Product {
  id: string;
  name: string;
  barcode: string | null;
  currentStock: number;
  minimumStock: number;
  category: { id: string; name: string };
}

interface StockMovement {
  id: string;
  type: string;
  quantity: number;
  reason: string | null;
  reference: string | null;
  createdAt: string;
  product: { id: string; name: string };
  user: { firstName: string; lastName: string } | null;
}

interface ImportIssue {
  row: number;
  field: string;
  message: string;
}

interface ImportResult {
  success: boolean;
  message: string;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

interface Batch {
  id: string;
  batchNumber: string;
  expirationDate: string;
  quantity: number;
  costPrice: string;
  isExpired?: boolean;
  isExpiringSoon?: boolean;
  product: { id: string; name: string; barcode: string | null; category: { name: string } | null };
}

type Tab = "stock" | "movements" | "batches";

export default function InventoryClient({ isOwner = false }: { isOwner?: boolean }) {
  const [tab, setTab] = useState<Tab>("stock");
  const [search, setSearch] = useState("");
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importMode, setImportMode] = useState<"add" | "update" | "correction">("add");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showReceiveBatch, setShowReceiveBatch] = useState(false);
  const [batchForm, setBatchForm] = useState({ productId: "", productName: "", batchNumber: "", expirationDate: "", quantity: "", costPrice: "" });
  const [batchProductResults, setBatchProductResults] = useState<Product[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchSaving, setBatchSaving] = useState(false);

  const [clearConfirm, setClearConfirm] = useState("");
  const [clearing, setClearing] = useState(false);
  const [clearMessage, setClearMessage] = useState<string | null>(null);

  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [batchMessage, setBatchMessage] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);
  const productsUrl = debouncedSearch ? `/api/products?search=${encodeURIComponent(debouncedSearch)}` : "/api/products";
  const {
    data: products = [],
    isLoading: productsLoading,
    mutate: refreshProducts,
  } = useSWR<Product[]>(tab === "stock" ? productsUrl : null, { keepPreviousData: true });

  const { data: movements = [], isLoading: movementsLoading } = useSWR<StockMovement[]>(
    tab === "movements" ? "/api/inventory/stock-movements" : null
  );

  const {
    data: batches = [],
    isLoading: batchesLoading,
    mutate: refreshBatches,
  } = useSWR<Batch[]>(tab === "batches" ? "/api/inventory/batches?nearExpiry=true&days=90" : null);

  useEffect(() => {
    if (!showReceiveBatch || !batchForm.productName.trim()) {
      setBatchProductResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/products?search=${encodeURIComponent(batchForm.productName)}`);
      const data = await res.json();
      setBatchProductResults(Array.isArray(data) ? data : []);
    }, 250);
    return () => clearTimeout(t);
  }, [batchForm.productName, showReceiveBatch]);

  const submitReceiveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setBatchError(null);
    if (!batchForm.productId) {
      setBatchError("Select a product first.");
      return;
    }
    setBatchSaving(true);
    try {
      const res = await fetch("/api/inventory/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: batchForm.productId,
          batchNumber: batchForm.batchNumber,
          expirationDate: batchForm.expirationDate,
          quantity: parseInt(batchForm.quantity, 10) || 0,
          costPrice: parseFloat(batchForm.costPrice) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBatchError(data.error ?? "Failed to receive batch.");
        return;
      }
      setShowReceiveBatch(false);
      setBatchForm({ productId: "", productName: "", batchNumber: "", expirationDate: "", quantity: "", costPrice: "" });
      refreshBatches();
    } catch {
      setBatchError("Network error.");
    } finally {
      setBatchSaving(false);
    }
  };

  const discardBatch = async (batch: Batch, movementReason: "expired" | "damaged") => {
    if (!confirm(`Discard batch ${batch.batchNumber} (${batch.quantity} units) as ${movementReason}?`)) return;
    setDiscardingId(batch.id);
    setBatchMessage(null);
    try {
      const res = await fetch(`/api/inventory/batches/${batch.id}?reason=${movementReason}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setBatchMessage(data.error ?? "Failed to discard batch.");
        return;
      }
      await refreshBatches();
      setBatchMessage(`Batch ${batch.batchNumber} discarded as ${movementReason}.`);
      setTimeout(() => setBatchMessage(null), 3000);
    } catch {
      setBatchMessage("Network error.");
    } finally {
      setDiscardingId(null);
    }
  };

  const submitClearInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    setClearMessage(null);
    setClearing(true);
    try {
      const res = await fetch("/api/inventory/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: clearConfirm }),
      });
      const data = await res.json();
      if (!res.ok) {
        setClearMessage(data.error ?? "Failed to clear inventory.");
        return;
      }
      setClearMessage(`Cleared: ${data.deletedProducts} deleted, ${data.archivedProducts} archived.`);
      setClearConfirm("");
      refreshProducts();
    } catch {
      setClearMessage("Network error.");
    } finally {
      setClearing(false);
    }
  };

  const openAdjust = (product: Product) => {
    setAdjustTarget(product);
    setAdjustQty("");
    setAdjustReason("");
    setAdjustError(null);
  };

  const submitAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget) return;
    const qty = parseInt(adjustQty, 10);
    if (!qty) {
      setAdjustError("Enter a non-zero whole number.");
      return;
    }
    setSaving(true);
    setAdjustError(null);
    try {
      const res = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: adjustTarget.id, adjustment: qty, reason: adjustReason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAdjustError(data.error ?? "Failed to adjust stock.");
        return;
      }
      setAdjustTarget(null);
      refreshProducts();
    } catch {
      setAdjustError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", importMode);
      const res = await fetch("/api/inventory/import", { method: "POST", body: formData });
      const data = await res.json();
      setImportResult(data);
      if (data.created || data.updated) refreshProducts();
    } catch {
      setImportResult({
        success: false,
        message: "Network error during import.",
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [{ row: 0, field: "network", message: "Failed to reach server." }],
        warnings: [],
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Inventory</h1>
          <p className="mt-1 text-sm text-zinc-500">Adjust stock, review movement history, and bulk import/export.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/api/inventory/template"
            className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-300"
          >
            <Download className="h-4 w-4" /> Import template
          </a>
          <a
            href="/api/inventory/correction-template"
            className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-300"
          >
            <Download className="h-4 w-4" /> Count sheet
          </a>
          <a
            href="/api/inventory/export"
            className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-300"
          >
            <Download className="h-4 w-4" /> Export
          </a>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={importMode}
            onChange={(e) => setImportMode(e.target.value as typeof importMode)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="add">Add new products</option>
            <option value="update">Update existing products</option>
            <option value="correction">Stock correction (count sheet)</option>
          </select>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" /> {importing ? "Importing..." : "Import spreadsheet"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
            }}
          />
        </div>

        {importResult && (
          <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
            <p className={importResult.success ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>
              {importResult.message}
            </p>
            {importResult.errors.length > 0 && (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-red-600">
                {importResult.errors.map((e, i) => (
                  <li key={i}>
                    Row {e.row} ({e.field}): {e.message}
                  </li>
                ))}
              </ul>
            )}
            {importResult.warnings.length > 0 && (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-amber-600">
                {importResult.warnings.map((w, i) => (
                  <li key={i}>
                    Row {w.row} ({w.field}): {w.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-2 border-b border-zinc-200">
        {(["stock", "batches", "movements"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold ${
              tab === t ? "border-b-2 border-emerald-600 text-emerald-700" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {t === "stock" ? "Stock levels" : t === "batches" ? "Batches & expiry" : "Movement history"}
          </button>
        ))}
      </div>

      {tab === "stock" && (
        <>
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2">
            <Search className="h-4 w-4 text-zinc-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full text-sm outline-none"
            />
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase text-zinc-400">
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Current stock</th>
                  <th className="px-4 py-3">Minimum</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {productsLoading && products.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">Loading...</td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">No products found.</td>
                  </tr>
                ) : (
                  products.map((p) => {
                    const low = p.currentStock <= p.minimumStock;
                    const out = p.currentStock <= 0;
                    return (
                      <tr key={p.id} className="border-b border-zinc-50 last:border-0">
                        <td className="px-4 py-3">
                          <p className="font-medium text-zinc-900">{p.name}</p>
                          <p className="text-xs text-zinc-500">{p.barcode}</p>
                        </td>
                        <td className="px-4 py-3 text-zinc-600">{p.category?.name}</td>
                        <td className="px-4 py-3">
                          <span className={out ? "font-semibold text-red-600" : low ? "font-semibold text-amber-600" : "text-zinc-700"}>
                            {p.currentStock}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-500">{p.minimumStock}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => openAdjust(p)}
                            className="flex items-center gap-1 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-zinc-300"
                          >
                            <PackagePlus className="h-3.5 w-3.5" /> Adjust
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "batches" && (
        <>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-zinc-500">Batches expiring within 90 days, across all expiry dates received for the same product.</p>
            <button
              onClick={() => setShowReceiveBatch(true)}
              className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              <Plus className="h-4 w-4" /> Receive batch
            </button>
          </div>

          {batchMessage && (
            <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700">{batchMessage}</p>
          )}

          <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase text-zinc-400">
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Batch #</th>
                  <th className="px-4 py-3">Expiry</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {batchesLoading && batches.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">Loading...</td>
                  </tr>
                ) : batches.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">No batches expiring soon.</td>
                  </tr>
                ) : (
                  batches.map((b) => (
                    <tr key={b.id} className="border-b border-zinc-50 last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium text-zinc-900">{b.product.name}</p>
                        <p className="text-xs text-zinc-500">{b.product.category?.name}</p>
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{b.batchNumber}</td>
                      <td className="px-4 py-3 text-zinc-600">{formatDate(b.expirationDate)}</td>
                      <td className="px-4 py-3 text-zinc-700">{b.quantity}</td>
                      <td className="px-4 py-3">
                        {b.isExpired ? (
                          <span className="flex items-center gap-1 text-xs font-semibold text-red-600">
                            <AlertTriangle className="h-3.5 w-3.5" /> Expired
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-amber-600">Expiring soon</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => discardBatch(b, b.isExpired ? "expired" : "damaged")}
                          disabled={discardingId === b.id}
                          className="flex items-center gap-1 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                        >
                          <Trash2 className={`h-3.5 w-3.5 ${discardingId === b.id ? "animate-pulse" : ""}`} />
                          {discardingId === b.id ? "Discarding..." : "Discard"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "movements" && (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase text-zinc-400">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">By</th>
              </tr>
            </thead>
            <tbody>
              {movementsLoading && movements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">Loading...</td>
                </tr>
              ) : movements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">No stock movements yet.</td>
                </tr>
              ) : (
                movements.map((m) => (
                  <tr key={m.id} className="border-b border-zinc-50 last:border-0">
                    <td className="px-4 py-3 text-zinc-500">{formatDateTime(m.createdAt)}</td>
                    <td className="px-4 py-3 font-medium text-zinc-900">{m.product.name}</td>
                    <td className="px-4 py-3 text-zinc-600">{m.type}</td>
                    <td className={`px-4 py-3 font-semibold ${m.quantity < 0 ? "text-red-600" : "text-emerald-700"}`}>
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{m.reason || "-"}</td>
                    <td className="px-4 py-3 text-zinc-500">{m.user ? `${m.user.firstName} ${m.user.lastName}` : "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900">Adjust stock</h2>
              <button onClick={() => setAdjustTarget(null)}>
                <X className="h-5 w-5 text-zinc-400" />
              </button>
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              {adjustTarget.name} &middot; current stock {adjustTarget.currentStock}
            </p>
            <form onSubmit={submitAdjust} className="mt-4 space-y-3">
              <input
                required
                type="number"
                placeholder="Adjustment (e.g. 10 or -5)"
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
              <input
                placeholder="Reason (optional)"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
              {adjustError && <p className="text-sm text-red-600">{adjustError}</p>}
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save adjustment"}
              </button>
            </form>
          </div>
        </div>
      )}

      {showReceiveBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900">Receive batch</h2>
              <button onClick={() => setShowReceiveBatch(false)}>
                <X className="h-5 w-5 text-zinc-400" />
              </button>
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              Adds a new expiry-dated lot for a product without overwriting stock already on hand from other expiry dates.
            </p>

            <form onSubmit={submitReceiveBatch} className="mt-4 space-y-3">
              <div className="relative">
                <input
                  required
                  placeholder="Search product..."
                  value={batchForm.productName}
                  onChange={(e) => setBatchForm({ ...batchForm, productName: e.target.value, productId: "" })}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
                {batchProductResults.length > 0 && !batchForm.productId && (
                  <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
                    {batchProductResults.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => {
                          setBatchForm({ ...batchForm, productId: p.id, productName: p.name });
                          setBatchProductResults([]);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-emerald-50"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                required
                placeholder="Batch / lot number"
                value={batchForm.batchNumber}
                onChange={(e) => setBatchForm({ ...batchForm, batchNumber: e.target.value })}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  required
                  type="date"
                  value={batchForm.expirationDate}
                  onChange={(e) => setBatchForm({ ...batchForm, expirationDate: e.target.value })}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
                <input
                  required
                  type="number"
                  min={1}
                  placeholder="Quantity"
                  value={batchForm.quantity}
                  onChange={(e) => setBatchForm({ ...batchForm, quantity: e.target.value })}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
                <input
                  required
                  type="number"
                  step="0.01"
                  placeholder="Cost price / unit"
                  value={batchForm.costPrice}
                  onChange={(e) => setBatchForm({ ...batchForm, costPrice: e.target.value })}
                  className="col-span-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>

              {batchError && <p className="text-sm text-red-600">{batchError}</p>}

              <button
                type="submit"
                disabled={batchSaving}
                className="w-full rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {batchSaving ? "Saving..." : "Receive batch"}
              </button>
            </form>
          </div>
        </div>
      )}

      {isOwner && (
        <div className="mt-10 rounded-2xl border border-red-200 bg-red-50 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-red-700">
            <AlertTriangle className="h-4 w-4" /> Danger zone
          </h2>
          <p className="mt-1 text-sm text-red-600">
            Permanently deletes products with no sales/prescription history and archives the rest. This cannot be undone.
          </p>
          <form onSubmit={submitClearInventory} className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={clearConfirm}
              onChange={(e) => setClearConfirm(e.target.value)}
              placeholder='Type "CLEAR INVENTORY" to confirm'
              className="rounded-lg border border-red-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={clearing || clearConfirm !== "CLEAR INVENTORY"}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
            >
              {clearing ? "Clearing..." : "Clear inventory"}
            </button>
          </form>
          {clearMessage && <p className="mt-2 text-sm text-red-700">{clearMessage}</p>}
        </div>
      )}
    </div>
  );
}

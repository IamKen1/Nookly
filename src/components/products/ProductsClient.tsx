"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Settings, Trash2, X } from "lucide-react";
import ImageUpload from "./ImageUpload";
import CategoryManager from "./CategoryManager";

interface Category {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  genericName: string | null;
  brandName: string | null;
  barcode: string | null;
  costPrice: string;
  sellingPrice: string;
  currentStock: number;
  minimumStock: number;
  requiresPrescription: boolean;
  isVatable: boolean;
  isOTC: boolean;
  drugSchedule: string | null;
  imageUrl: string | null;
  category: { id: string; name: string };
}

const DRUG_SCHEDULES = ["SCHEDULE_I", "SCHEDULE_II", "SCHEDULE_III", "SCHEDULE_IV", "SCHEDULE_V"];

const emptyForm = {
  name: "",
  genericName: "",
  brandName: "",
  barcode: "",
  categoryId: "",
  costPrice: "",
  sellingPrice: "",
  currentStock: "0",
  minimumStock: "0",
  requiresPrescription: false,
  isVatable: true,
  isOTC: true,
  drugSchedule: "",
  imageUrl: null as string | null,
};

export default function ProductsClient({
  categories: initialCategories,
  planName,
  maxProducts,
}: {
  categories: Category[];
  planName: string;
  maxProducts: number;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const flashSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 2500);
  };

  const loadCategories = useCallback(async () => {
    const res = await fetch("/api/categories");
    const data = await res.json();
    setCategories(Array.isArray(data) ? data : []);
  }, []);

  const loadProducts = useCallback(async (q?: string) => {
    setLoading(true);
    const url = q ? `/api/products?search=${encodeURIComponent(q)}` : "/api/products";
    const res = await fetch(url);
    const data = await res.json();
    setProducts(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadProducts(search), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, loadProducts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          costPrice: parseFloat(form.costPrice) || 0,
          sellingPrice: parseFloat(form.sellingPrice) || 0,
          currentStock: parseInt(form.currentStock) || 0,
          minimumStock: parseInt(form.minimumStock) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save product.");
        return;
      }
      setShowForm(false);
      setForm(emptyForm);
      await loadProducts(search);
      flashSuccess("Product saved.");
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this product?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to remove product.");
        return;
      }
      await loadProducts(search);
      flashSuccess("Product removed.");
    } catch {
      setError("Network error.");
    } finally {
      setDeletingId(null);
    }
  };

  const atLimit = maxProducts !== -1 && products.length >= maxProducts;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Products</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {maxProducts === -1 ? "Unlimited products" : `${products.length} / ${maxProducts} products (${planName} plan)`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCategoryManager(true)}
            className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-300"
          >
            <Settings className="h-4 w-4" /> Categories
          </button>
          <button
            onClick={() => setShowForm(true)}
            disabled={atLimit}
            className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Add product
          </button>
        </div>
      </div>

      {successMessage && (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{successMessage}</p>
      )}
      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2">
        <Search className="h-4 w-4 text-zinc-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, generic name, or barcode..."
          className="w-full text-sm outline-none"
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase text-zinc-400">
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">Loading...</td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">No products yet.</td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} className="border-b border-zinc-50 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
                      ) : (
                        <div className="h-9 w-9 rounded-lg bg-zinc-100" />
                      )}
                      <div>
                        <p className="font-medium text-zinc-900">{p.name}</p>
                        <p className="text-xs text-zinc-500">{p.genericName || p.brandName || p.barcode}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{p.category?.name}</td>
                  <td className="px-4 py-3 text-zinc-900">₱{Number(p.sellingPrice).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={p.currentStock <= p.minimumStock ? "font-semibold text-amber-600" : "text-zinc-700"}>
                      {p.currentStock}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={deletingId === p.id}
                      className="text-zinc-400 hover:text-red-600 disabled:opacity-40"
                    >
                      <Trash2 className={`h-4 w-4 ${deletingId === p.id ? "animate-pulse" : ""}`} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900">Add product</h2>
              <button onClick={() => setShowForm(false)}>
                <X className="h-5 w-5 text-zinc-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <ImageUpload currentImage={form.imageUrl} onImageChange={(url) => setForm({ ...form, imageUrl: url })} />
              <div className="grid grid-cols-2 gap-3">
                <input
                  required
                  placeholder="Product name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="col-span-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
                <input
                  placeholder="Generic name"
                  value={form.genericName}
                  onChange={(e) => setForm({ ...form, genericName: e.target.value })}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
                <input
                  placeholder="Brand name"
                  value={form.brandName}
                  onChange={(e) => setForm({ ...form, brandName: e.target.value })}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
                <input
                  placeholder="Barcode"
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
                <select
                  required
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                >
                  <option value="">Category...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  required
                  type="number"
                  step="0.01"
                  placeholder="Cost price"
                  value={form.costPrice}
                  onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
                <input
                  required
                  type="number"
                  step="0.01"
                  placeholder="Selling price"
                  value={form.sellingPrice}
                  onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  placeholder="Starting stock"
                  value={form.currentStock}
                  onChange={(e) => setForm({ ...form, currentStock: e.target.value })}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  placeholder="Minimum stock"
                  value={form.minimumStock}
                  onChange={(e) => setForm({ ...form, minimumStock: e.target.value })}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
                <select
                  value={form.drugSchedule}
                  onChange={(e) => setForm({ ...form, drugSchedule: e.target.value })}
                  className="col-span-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                >
                  <option value="">Drug schedule: Unscheduled</option>
                  {DRUG_SCHEDULES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-600">
                <input
                  type="checkbox"
                  checked={form.requiresPrescription}
                  onChange={(e) => setForm({ ...form, requiresPrescription: e.target.checked })}
                />
                Requires prescription
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-600">
                <input
                  type="checkbox"
                  checked={form.isOTC}
                  onChange={(e) => setForm({ ...form, isOTC: e.target.checked })}
                />
                Over-the-counter (OTC)
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-600">
                <input
                  type="checkbox"
                  checked={form.isVatable}
                  onChange={(e) => setForm({ ...form, isVatable: e.target.checked })}
                />
                VAT-able
              </label>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save product"}
              </button>
            </form>
          </div>
        </div>
      )}

      {showCategoryManager && (
        <CategoryManager categories={categories} onClose={() => setShowCategoryManager(false)} onChanged={loadCategories} />
      )}
    </div>
  );
}

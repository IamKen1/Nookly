"use client";

import { useState } from "react";
import useSWR from "swr";
import { Plus, Search, Settings, Trash2, X, Pencil, Loader2 } from "lucide-react";
import ImageUpload from "./ImageUpload";
import CategoryManager from "./CategoryManager";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

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
  description: string | null;
  costPrice: string;
  sellingPrice: string;
  currentStock: number;
  minimumStock: number;
  maximumStock: number | null;
  reorderPoint: number;
  requiresPrescription: boolean;
  isVatable: boolean;
  isOTC: boolean;
  drugSchedule: string | null;
  imageUrl: string | null;
  category: { id: string; name: string };
}

const DRUG_SCHEDULES = ["SCHEDULE_I", "SCHEDULE_II", "SCHEDULE_III", "SCHEDULE_IV", "SCHEDULE_V"];

const Field = ({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) => (
  <div className={className}>
    <label className="mb-1 block text-xs font-medium text-zinc-500">{label}</label>
    {children}
  </div>
);

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
  maximumStock: "",
  reorderPoint: "0",
  description: "",
  requiresPrescription: false,
  isVatable: true,
  isOTC: true,
  drugSchedule: "",
  imageUrl: null as string | null,
  batchNumber: "",
  expirationDate: "",
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
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  const { data: categories = initialCategories, mutate: refreshCategories } = useSWR<Category[]>(
    "/api/categories",
    { fallbackData: initialCategories }
  );

  const productsUrl = debouncedSearch
    ? `/api/products?search=${encodeURIComponent(debouncedSearch)}`
    : "/api/products";
  const {
    data: products = [],
    isLoading: loading,
    mutate: refreshProducts,
  } = useSWR<Product[]>(productsUrl, { keepPreviousData: true });

  const flashSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 2500);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingProduct(null);
    setForm(emptyForm);
    setError(null);
  };

  const handleEditClick = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      genericName: product.genericName ?? "",
      brandName: product.brandName ?? "",
      barcode: product.barcode ?? "",
      categoryId: product.category.id,
      costPrice: product.costPrice,
      sellingPrice: product.sellingPrice,
      currentStock: String(product.currentStock),
      minimumStock: String(product.minimumStock),
      maximumStock: product.maximumStock != null ? String(product.maximumStock) : "",
      reorderPoint: String(product.reorderPoint),
      description: product.description ?? "",
      requiresPrescription: product.requiresPrescription,
      isVatable: product.isVatable,
      isOTC: product.isOTC,
      drugSchedule: product.drugSchedule ?? "",
      imageUrl: product.imageUrl,
      batchNumber: "",
      expirationDate: "",
    });
    setError(null);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!editingProduct && Boolean(form.batchNumber.trim()) !== Boolean(form.expirationDate)) {
      setError("Provide both a batch number and an expiration date, or leave both blank.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(editingProduct ? `/api/products/${editingProduct.id}` : "/api/products", {
        method: editingProduct ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          costPrice: parseFloat(form.costPrice) || 0,
          sellingPrice: parseFloat(form.sellingPrice) || 0,
          currentStock: parseInt(form.currentStock) || 0,
          minimumStock: parseInt(form.minimumStock) || 0,
          maximumStock: form.maximumStock ? parseInt(form.maximumStock) : null,
          reorderPoint: parseInt(form.reorderPoint) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save product.");
        return;
      }
      closeForm();
      await refreshProducts();
      flashSuccess(editingProduct ? "Product updated." : "Product saved.");
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
      await refreshProducts();
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
            onClick={() => {
              setEditingProduct(null);
              setForm(emptyForm);
              setShowForm(true);
            }}
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
            {loading && products.length === 0 ? (
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
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => handleEditClick(p)} className="text-zinc-400 hover:text-emerald-600">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        disabled={deletingId === p.id}
                        className="text-zinc-400 hover:text-red-600 disabled:opacity-40 btn-press"
                      >
                        {deletingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={handleSubmit}
            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-zinc-900">{editingProduct ? "Edit product" : "Add product"}</h2>
              <button type="button" onClick={closeForm}>
                <X className="h-5 w-5 text-zinc-400" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <ImageUpload currentImage={form.imageUrl} onImageChange={(url) => setForm({ ...form, imageUrl: url })} />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Product name" className="sm:col-span-2 lg:col-span-3">
                  <input
                    required
                    placeholder="e.g., Biogesic 500mg Tablet"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="Generic name">
                  <input
                    value={form.genericName}
                    onChange={(e) => setForm({ ...form, genericName: e.target.value })}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="Brand name">
                  <input
                    value={form.brandName}
                    onChange={(e) => setForm({ ...form, brandName: e.target.value })}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="Barcode">
                  <input
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="Category">
                  <select
                    required
                    value={form.categoryId}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  >
                    <option value="">Category...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Drug Schedule" className="sm:col-span-1 lg:col-span-2">
                  <select
                    value={form.drugSchedule}
                    onChange={(e) => setForm({ ...form, drugSchedule: e.target.value })}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  >
                    <option value="">Unscheduled</option>
                    {DRUG_SCHEDULES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="rounded-xl border border-zinc-200 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Pricing &amp; Stock</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <Field label="Cost Price (₱)">
                    <input
                      required
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={form.costPrice}
                      onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Selling Price (₱)">
                    <input
                      required
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={form.sellingPrice}
                      onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label={editingProduct ? "Current Stock" : "Starting Stock"}>
                    <input
                      type="number"
                      value={form.currentStock}
                      onChange={(e) => setForm({ ...form, currentStock: e.target.value })}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Minimum Stock">
                    <input
                      type="number"
                      value={form.minimumStock}
                      onChange={(e) => setForm({ ...form, minimumStock: e.target.value })}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Maximum Stock">
                    <input
                      type="number"
                      value={form.maximumStock}
                      onChange={(e) => setForm({ ...form, maximumStock: e.target.value })}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Reorder Point">
                    <input
                      type="number"
                      value={form.reorderPoint}
                      onChange={(e) => setForm({ ...form, reorderPoint: e.target.value })}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                    />
                  </Field>
                </div>
              </div>

              <Field label="Description">
                <textarea
                  placeholder="Enter product description..."
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </Field>

              {!editingProduct && parseInt(form.currentStock || "0") > 0 && (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <p className="mb-2 text-xs font-medium text-zinc-500">
                    Track this starting stock as a batch (optional) so it&apos;s covered by expiry alerts.
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Batch number">
                      <input
                        value={form.batchNumber}
                        onChange={(e) => setForm({ ...form, batchNumber: e.target.value })}
                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="Expiration date">
                      <input
                        type="date"
                        value={form.expirationDate}
                        onChange={(e) => setForm({ ...form, expirationDate: e.target.value })}
                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                      />
                    </Field>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-x-6 gap-y-2">
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
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-zinc-200 px-6 py-4">
              {error && <p className="mr-auto text-sm text-red-600">{error}</p>}
              <button
                type="button"
                onClick={closeForm}
                className="rounded-full px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 btn-press"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? "Saving..." : editingProduct ? "Save changes" : "Save product"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showCategoryManager && (
        <CategoryManager categories={categories} onClose={() => setShowCategoryManager(false)} onChanged={() => refreshCategories()} />
      )}
    </div>
  );
}

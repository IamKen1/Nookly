"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import UsernameField from "@/components/shared/UsernameField";

interface Store {
  id: string;
  name: string;
}

interface UserRow {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  storeId: string | null;
  isActive: boolean;
}

const ROLES = ["OWNER", "ADMIN", "PHARMACIST", "PHARMACY_TECH", "CASHIER", "MANAGER"];

const emptyForm = {
  email: "",
  username: "",
  firstName: "",
  lastName: "",
  role: "CASHIER",
  password: "",
  storeId: "",
};

export default function UsersClient({ stores, planName, maxUsers }: { stores: Store[]; planName: string; maxUsers: number }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const flashSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 2500);
  };

  // showLoading is only passed on the initial mount — refreshing after a
  // create/deactivate/remove must not flash the whole table back to
  // "Loading...", it should just swap in the updated rows in place.
  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    const res = await fetch("/api/users");
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
    if (showLoading) setLoading(false);
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create user.");
        return;
      }
      setShowForm(false);
      setForm(emptyForm);
      await load();
      flashSuccess("User added.");
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (user: UserRow) => {
    setBusyId(user.id);
    setError(null);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to update user.");
        return;
      }
      await load();
      flashSuccess(user.isActive ? "User deactivated." : "User activated.");
    } catch {
      setError("Network error.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this user?")) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to remove user.");
        return;
      }
      await load();
      flashSuccess(data.deactivated ? data.message : "User removed.");
    } catch {
      setError("Network error.");
    } finally {
      setBusyId(null);
    }
  };

  const atLimit = maxUsers !== -1 && users.filter((u) => u.isActive).length >= maxUsers;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Users</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {maxUsers === -1 ? "Unlimited users" : `${users.filter((u) => u.isActive).length} / ${maxUsers} users (${planName} plan)`}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          disabled={atLimit}
          className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Add user
        </button>
      </div>

      {successMessage && <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{successMessage}</p>}
      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase text-zinc-400">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">Loading...</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">No users yet.</td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-zinc-50 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-900">{u.firstName} {u.lastName}</p>
                    <p className="text-xs text-zinc-500">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{u.username}</td>
                  <td className="px-4 py-3 text-zinc-600">{u.role}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(u)}
                      disabled={busyId === u.id}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-50 ${u.isActive ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}
                    >
                      {busyId === u.id ? "..." : u.isActive ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => remove(u.id)}
                      disabled={busyId === u.id}
                      className="text-xs font-semibold text-zinc-400 hover:text-red-600 disabled:opacity-50"
                    >
                      {busyId === u.id ? "..." : "Remove"}
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
              <h2 className="text-lg font-semibold text-zinc-900">Add user</h2>
              <button onClick={() => setShowForm(false)}>
                <X className="h-5 w-5 text-zinc-400" />
              </button>
            </div>

            <form onSubmit={submit} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  required
                  placeholder="First name"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
                <input
                  required
                  placeholder="Last name"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
                <input
                  required
                  type="email"
                  placeholder="Email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="col-span-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
                <UsernameField
                  label=""
                  placeholder="Username"
                  value={form.username}
                  onChange={(v) => setForm({ ...form, username: v })}
                  hint={{ firstName: form.firstName, lastName: form.lastName }}
                />
                <input
                  required
                  type="password"
                  placeholder="Password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <select
                  value={form.storeId}
                  onChange={(e) => setForm({ ...form, storeId: e.target.value })}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                >
                  <option value="">Default branch</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save user"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

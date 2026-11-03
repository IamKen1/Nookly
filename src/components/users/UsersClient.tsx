"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { KeyRound, Loader2, Plus, X } from "lucide-react";
import UsernameField from "@/components/shared/UsernameField";
import { ALL_ROLE_LABELS } from "@/lib/permissions-shared";
import { SortableTh, useTableSort } from "@/components/app/SortableHeader";

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
  hasStaffCode?: boolean;
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
  staffCode: "",
};

// 4–6 digits, typed on a number pad.
const CODE_INPUT = {
  type: "password",
  inputMode: "numeric" as const,
  autoComplete: "off",
  maxLength: 6,
  pattern: "\\d{4,6}",
  title: "4 to 6 digits",
};

export default function UsersClient({
  stores,
  planName,
  maxUsers,
  currentUserId,
  currentRole,
}: {
  stores: Store[];
  planName: string;
  maxUsers: number;
  currentUserId: string;
  currentRole: string;
}) {
  // Only an owner can create owners or change an owner's role (the API enforces this too).
  const assignableRoles = ROLES.filter((r) => r !== "OWNER" || currentRole === "OWNER");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Staff security codes (Empire plan, 2+ branches): shown only when offered.
  const { data: codeSetting, mutate: refreshCodeSetting } = useSWR<{ available: boolean; enabled: boolean; usersWithoutCode: number }>("/api/settings/staff-code");
  const codesOn = Boolean(codeSetting?.available);
  const [codeFor, setCodeFor] = useState<UserRow | null>(null);
  const [codeValue, setCodeValue] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeSaving, setCodeSaving] = useState(false);

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
      refreshCodeSetting();
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

  const changeBranch = async (user: UserRow, storeId: string) => {
    setBusyId(user.id);
    setError(null);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to change branch.");
        return;
      }
      await load();
      flashSuccess("Branch updated. It takes effect the next time they log in.");
    } catch {
      setError("Network error.");
    } finally {
      setBusyId(null);
    }
  };

  const changeRole = async (user: UserRow, role: string) => {
    if (role === user.role) return;
    const label = ALL_ROLE_LABELS[role] ?? role;
    if (!confirm(`Change ${user.firstName} ${user.lastName}'s role to ${label}? It takes effect the next time they log in.`)) return;
    setBusyId(user.id);
    setError(null);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to change role.");
        return;
      }
      await load();
      flashSuccess(`Role changed to ${label}. It takes effect the next time they log in.`);
    } catch {
      setError("Network error.");
    } finally {
      setBusyId(null);
    }
  };

  const multiBranch = stores.length > 1;
  const { sorted: sortedUsers, sort, toggle } = useTableSort(users, {
    name: (u) => `${u.firstName} ${u.lastName}`,
    username: (u) => u.username,
    role: (u) => ALL_ROLE_LABELS[u.role as keyof typeof ALL_ROLE_LABELS] ?? u.role,
    branch: (u) => stores.find((st) => st.id === u.storeId)?.name,
    status: (u) => (u.isActive ? 0 : 1),
  });

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

  const saveCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeFor) return;
    setCodeSaving(true);
    setCodeError(null);
    try {
      const res = await fetch(`/api/users/${codeFor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffCode: codeValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCodeError(data.error ?? "Couldn't save the code.");
        return;
      }
      const name = `${codeFor.firstName} ${codeFor.lastName}`;
      setCodeFor(null);
      setCodeValue("");
      await load();
      refreshCodeSetting();
      flashSuccess(`Security code saved for ${name}.`);
    } catch {
      setCodeError("Network error.");
    } finally {
      setCodeSaving(false);
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
      {codeSetting?.enabled && codeSetting.usersWithoutCode > 0 && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {codeSetting.usersWithoutCode} active user{codeSetting.usersWithoutCode === 1 ? " has" : "s have"} no security code, so they can&apos;t send orders or
          complete sales. Use <span className="font-semibold">Set code</span> below.
        </p>
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase text-zinc-400">
              <SortableTh label="Name" sortKey="name" sort={sort} onSort={toggle} />
              <SortableTh label="Username" sortKey="username" sort={sort} onSort={toggle} />
              <SortableTh label="Role" sortKey="role" sort={sort} onSort={toggle} />
              {multiBranch && <SortableTh label="Branch" sortKey="branch" sort={sort} onSort={toggle} />}
              <SortableTh label="Status" sortKey="status" sort={sort} onSort={toggle} />
              {codesOn && <th className="px-4 py-3">Security code</th>}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={(multiBranch ? 6 : 5) + (codesOn ? 1 : 0)} className="px-4 py-8 text-center text-zinc-400">Loading...</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={(multiBranch ? 6 : 5) + (codesOn ? 1 : 0)} className="px-4 py-8 text-center text-zinc-400">No users yet.</td>
              </tr>
            ) : (
              sortedUsers.map((u) => (
                <tr key={u.id} className="border-b border-zinc-50 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-900">{u.firstName} {u.lastName}</p>
                    <p className="text-xs text-zinc-500">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{u.username}</td>
                  <td className="px-4 py-3 text-zinc-600">
                    {u.id === currentUserId || (u.role === "OWNER" && currentRole !== "OWNER") ? (
                      <span title={u.id === currentUserId ? "You can't change your own role" : undefined}>
                        {ALL_ROLE_LABELS[u.role] ?? u.role}
                        {u.id === currentUserId && <span className="ml-1.5 text-xs text-zinc-400">(you)</span>}
                      </span>
                    ) : (
                      <select
                        value={u.role}
                        onChange={(e) => changeRole(u, e.target.value)}
                        disabled={busyId === u.id}
                        aria-label={`Role for ${u.firstName} ${u.lastName}`}
                        className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 disabled:opacity-50"
                      >
                        {assignableRoles.map((r) => (
                          <option key={r} value={r}>
                            {ALL_ROLE_LABELS[r] ?? r}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  {multiBranch && (
                    <td className="px-4 py-3">
                      <select
                        value={u.storeId ?? ""}
                        onChange={(e) => changeBranch(u, e.target.value)}
                        disabled={busyId === u.id}
                        className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 disabled:opacity-50"
                      >
                        {!u.storeId && <option value="">—</option>}
                        {stores.map((st) => (
                          <option key={st.id} value={st.id}>{st.name}</option>
                        ))}
                      </select>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(u)}
                      disabled={busyId === u.id || u.id === currentUserId}
                      title={u.id === currentUserId ? "You can't deactivate your own account" : undefined}
                      className={`flex items-center justify-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-50 btn-press ${u.isActive ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}
                    >
                      {busyId === u.id && <Loader2 className="h-3 w-3 animate-spin" />}
                      {u.isActive ? "Active" : "Inactive"}
                    </button>
                  </td>
                  {codesOn && (
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${u.hasStaffCode ? "text-emerald-700" : "text-amber-700"}`}>{u.hasStaffCode ? "Set" : "Not set"}</span>
                        {(u.role !== "OWNER" || currentRole === "OWNER") && (
                          <button
                            onClick={() => {
                              setCodeFor(u);
                              setCodeValue("");
                              setCodeError(null);
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 hover:border-zinc-300"
                          >
                            <KeyRound className="h-3 w-3" /> {u.hasStaffCode ? "Change" : "Set code"}
                          </button>
                        )}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">
                    {u.id !== currentUserId && (
                      <button
                        onClick={() => remove(u.id)}
                        disabled={busyId === u.id}
                        className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-red-600 disabled:opacity-50 btn-press"
                      >
                        {busyId === u.id && <Loader2 className="h-3 w-3 animate-spin" />}
                        Remove
                      </button>
                    )}
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
                  {assignableRoles.map((r) => (
                    <option key={r} value={r}>{ALL_ROLE_LABELS[r] ?? r}</option>
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
                {codesOn && (
                  <div className="col-span-2">
                    <input
                      {...CODE_INPUT}
                      required={codeSetting?.enabled}
                      placeholder={`Security code, 4–6 digits${codeSetting?.enabled ? "" : " (optional)"}`}
                      value={form.staffCode}
                      onChange={(e) => setForm({ ...form, staffCode: e.target.value.replace(/\D/g, "") })}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                    />
                    <p className="mt-1 text-xs text-zinc-500">
                      Their own code for sending orders and completing sales. Unique to them; give it to them privately.
                    </p>
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 btn-press"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? "Saving..." : "Save user"}
              </button>
            </form>
          </div>
        </div>
      )}

      {codeFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !codeSaving && setCodeFor(null)}>
          <form onSubmit={saveCode} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-zinc-900">
              Security code for {codeFor.firstName} {codeFor.lastName}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              4–6 digits, different from everyone else&apos;s. {codeFor.hasStaffCode ? "This replaces their current code." : ""} Codes can&apos;t be shown
              again, so give it to them privately.
            </p>
            <input
              {...CODE_INPUT}
              autoFocus
              required
              placeholder="New security code"
              value={codeValue}
              onChange={(e) => setCodeValue(e.target.value.replace(/\D/g, ""))}
              className="mt-4 w-full rounded-lg border border-zinc-300 px-3 py-2 text-center text-lg tracking-[0.4em]"
            />
            {codeError && <p className="mt-2 text-sm text-red-600">{codeError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setCodeFor(null)} disabled={codeSaving} className="rounded-full px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
                Cancel
              </button>
              <button
                type="submit"
                disabled={codeSaving}
                className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {codeSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save code
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

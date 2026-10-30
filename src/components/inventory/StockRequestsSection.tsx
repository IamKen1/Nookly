"use client";

import { useState } from "react";
import useSWR from "swr";
import { Inbox, Loader2, Search, Send, Trash2, X } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

interface StockRequest {
  id: string;
  requestNumber: string;
  status: "REQUESTED" | "APPROVED" | "DECLINED" | "CANCELLED";
  notes: string | null;
  decisionNote: string | null;
  transferReference: string | null;
  createdAt: string;
  handledAt: string | null;
  fromStore: { id: string; name: string };
  toStore: { id: string; name: string };
  requestedBy: string | null;
  handledBy: string | null;
  items: { productId: string; name: string; quantity: number; availableHere: number }[];
}

const STATUS_TONE: Record<StockRequest["status"], string> = {
  REQUESTED: "bg-amber-100 text-amber-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  DECLINED: "bg-red-100 text-red-700",
  CANCELLED: "bg-zinc-100 text-zinc-500",
};

export default function StockRequestsSection({
  stores,
  currentStoreId,
  onStockMoved,
}: {
  stores: { id: string; name: string }[];
  currentStoreId: string | null;
  onStockMoved: () => void;
}) {
  const { data, mutate } = useSWR<{ incoming: StockRequest[]; outgoing: StockRequest[] }>("/api/stock-requests");
  const [showNew, setShowNew] = useState(false);
  const [reviewing, setReviewing] = useState<StockRequest | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const incoming = data?.incoming ?? [];
  const outgoing = data?.outgoing ?? [];
  const waiting = incoming.filter((r) => r.status === "REQUESTED").length;
  const currentName = stores.find((s) => s.id === currentStoreId)?.name ?? "this branch";

  const cancel = async (r: StockRequest) => {
    if (!confirm(`Cancel request ${r.requestNumber}?`)) return;
    setBusyId(r.id);
    try {
      const res = await fetch(`/api/stock-requests/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const body = await res.json();
      setMessage(res.ok ? `Request ${r.requestNumber} cancelled.` : body.error ?? "Failed to cancel.");
      mutate();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            Stock requests
            {waiting > 0 && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-amber-950">{waiting} waiting</span>}
          </h3>
          <p className="text-xs text-zinc-500">Ask another branch for stock, or approve what other branches ask from {currentName}.</p>
        </div>
        <button
          onClick={() => {
            setMessage(null);
            setShowNew(true);
          }}
          className="flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:border-emerald-400 btn-press"
        >
          <Send className="h-4 w-4" /> Request stock
        </button>
      </div>

      {message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{message}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <RequestList
          title={`Asked from ${currentName}`}
          empty="No branch has asked this branch for stock."
          rows={incoming}
          render={(r) =>
            r.status === "REQUESTED" ? (
              <button
                onClick={() => setReviewing(r)}
                className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 btn-press"
              >
                Review
              </button>
            ) : null
          }
          direction="incoming"
        />
        <RequestList
          title={`Requested by ${currentName}`}
          empty="This branch hasn't requested stock yet."
          rows={outgoing}
          render={(r) =>
            r.status === "REQUESTED" ? (
              <button
                onClick={() => cancel(r)}
                disabled={busyId === r.id}
                className="flex items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:border-zinc-400 disabled:opacity-50 btn-press"
              >
                {busyId === r.id && <Loader2 className="h-3 w-3 animate-spin" />}
                Cancel
              </button>
            ) : null
          }
          direction="outgoing"
        />
      </div>

      {showNew && (
        <NewRequestModal
          stores={stores.filter((s) => s.id !== currentStoreId)}
          onClose={() => setShowNew(false)}
          onDone={(msg) => {
            setShowNew(false);
            setMessage(msg);
            mutate();
          }}
        />
      )}
      {reviewing && (
        <ReviewModal
          request={reviewing}
          onClose={() => setReviewing(null)}
          onDone={(msg) => {
            setReviewing(null);
            setMessage(msg);
            mutate();
            onStockMoved();
          }}
        />
      )}
    </div>
  );
}

function RequestList({
  title,
  empty,
  rows,
  render,
  direction,
}: {
  title: string;
  empty: string;
  rows: StockRequest[];
  render: (r: StockRequest) => React.ReactNode;
  direction: "incoming" | "outgoing";
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <p className="flex items-center gap-2 border-b border-zinc-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {direction === "incoming" ? <Inbox className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-zinc-400">{empty}</p>
      ) : (
        rows.slice(0, 15).map((r) => (
          <div key={r.id} className="border-b border-zinc-100 px-4 py-3 text-sm last:border-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-zinc-900">
                  {r.requestNumber}
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[r.status]}`}>{r.status}</span>
                </p>
                <p className="text-xs text-zinc-500">
                  {direction === "incoming" ? `For ${r.toStore.name}` : `From ${r.fromStore.name}`} · {r.requestedBy} · {formatDateTime(r.createdAt)}
                </p>
              </div>
              {render(r)}
            </div>
            <p className="mt-1 text-xs text-zinc-600">{r.items.map((i) => `${i.quantity} × ${i.name}`).join(", ")}</p>
            {r.notes && <p className="mt-1 text-xs italic text-zinc-500">&ldquo;{r.notes}&rdquo;</p>}
            {r.status !== "REQUESTED" && r.handledBy && (
              <p className="mt-1 text-xs text-zinc-400">
                {r.status === "APPROVED" ? "Sent" : r.status === "DECLINED" ? "Declined" : "Cancelled"} by {r.handledBy}
                {r.transferReference && ` · ${r.transferReference}`}
                {r.decisionNote && ` · “${r.decisionNote}”`}
              </p>
            )}
          </div>
        ))
      )}
    </div>
  );
}

interface BranchStockResult {
  stores: { id: string; name: string }[];
  products: { id: string; name: string; byStore: Record<string, number> }[];
}

function NewRequestModal({
  stores,
  onClose,
  onDone,
}: {
  stores: { id: string; name: string }[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [fromStoreId, setFromStoreId] = useState(stores[0]?.id ?? "");
  const [lines, setLines] = useState<{ productId: string; name: string; quantity: number }[]>([]);
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 250);
  const { data } = useSWR<BranchStockResult>(debounced ? `/api/inventory/branch-stock?search=${encodeURIComponent(debounced)}` : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fromName = stores.find((s) => s.id === fromStoreId)?.name ?? "";

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/stock-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromStoreId, notes, items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })) }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Failed to send the request.");
        return;
      }
      onDone(`Request ${body.requestNumber} sent to ${body.from}. Stock moves once they approve it.`);
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Request stock" onClose={onClose}>
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        <div>
          <p className="mb-1 text-xs font-medium text-zinc-500">Ask this branch</p>
          <select value={fromStoreId} onChange={(e) => setFromStoreId(e.target.value)} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="relative">
          <div className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2">
            <Search className="h-4 w-4 text-zinc-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a product to request..." className="w-full text-sm outline-none" />
          </div>
          {debounced && (data?.products.length ?? 0) > 0 && (
            <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
              {data!.products.slice(0, 20).map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    if (!lines.some((l) => l.productId === p.id)) setLines([...lines, { productId: p.id, name: p.name, quantity: 1 }]);
                    setSearch("");
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-emerald-50"
                >
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {p.byStore[fromStoreId] ?? 0} at {fromName}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        {lines.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-400">No products added yet.</p>
        ) : (
          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.productId} className="flex items-center gap-3 rounded-lg bg-zinc-50 px-3 py-2">
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900">{l.name}</p>
                <input
                  type="number"
                  min={1}
                  value={l.quantity}
                  onChange={(e) => {
                    const q = Math.max(1, Math.trunc(Number(e.target.value) || 1));
                    setLines(lines.map((x) => (x.productId === l.productId ? { ...x, quantity: q } : x)));
                  }}
                  className="w-20 rounded-lg border border-zinc-300 px-2 py-1 text-right text-sm"
                />
                <button onClick={() => setLines(lines.filter((x) => x.productId !== l.productId))} className="text-zinc-400 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional) — e.g., needed before Friday"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      </div>
      <ModalActions onClose={onClose} onConfirm={submit} confirmLabel={saving ? "Sending..." : "Send request"} busy={saving} disabled={lines.length === 0 || !fromStoreId} />
    </Modal>
  );
}

function ReviewModal({ request, onClose, onDone }: { request: StockRequest; onClose: () => void; onDone: (message: string) => void }) {
  // Prefill with what can actually be sent from here, capped at what was asked.
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries(request.items.map((i) => [i.productId, Math.min(i.quantity, i.availableHere)]))
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (action: "approve" | "decline") => {
    setError(null);
    setBusy(action);
    try {
      const res = await fetch(`/api/stock-requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          note,
          ...(action === "approve" ? { items: Object.entries(qty).map(([productId, quantity]) => ({ productId, quantity })) } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Action failed.");
        return;
      }
      onDone(
        action === "approve"
          ? `Sent to ${request.toStore.name} (${body.reference}).`
          : `Request ${request.requestNumber} declined.`
      );
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title={`Review ${request.requestNumber}`} onClose={onClose}>
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        <p className="text-sm text-zinc-600">
          <span className="font-semibold text-zinc-900">{request.toStore.name}</span> asked for these. Adjust what you&apos;ll send — set 0 to
          leave an item out.
        </p>
        <div className="space-y-2">
          {request.items.map((i) => (
            <div key={i.productId} className="flex items-center gap-3 rounded-lg bg-zinc-50 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900">{i.name}</p>
                <p className={`text-xs ${i.availableHere < i.quantity ? "text-red-600" : "text-zinc-500"}`}>
                  Asked {i.quantity} · {i.availableHere} here
                </p>
              </div>
              <input
                type="number"
                min={0}
                max={i.availableHere}
                value={qty[i.productId] ?? 0}
                onChange={(e) =>
                  setQty({ ...qty, [i.productId]: Math.max(0, Math.min(i.availableHere, Math.trunc(Number(e.target.value) || 0))) })
                }
                className="w-20 rounded-lg border border-zinc-300 px-2 py-1 text-right text-sm"
              />
            </div>
          ))}
        </div>
        {request.notes && <p className="text-xs italic text-zinc-500">Their note: &ldquo;{request.notes}&rdquo;</p>}
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reply note (optional)" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-zinc-100 px-6 py-4">
        <button
          onClick={() => act("decline")}
          disabled={busy !== null}
          className="flex items-center gap-2 rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 btn-press"
        >
          {busy === "decline" && <Loader2 className="h-4 w-4 animate-spin" />}
          Decline
        </button>
        <button
          onClick={() => act("approve")}
          disabled={busy !== null || Object.values(qty).every((q) => q <= 0)}
          className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 btn-press"
        >
          {busy === "approve" && <Loader2 className="h-4 w-4 animate-spin" />}
          Approve &amp; send
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-zinc-400" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({
  onClose,
  onConfirm,
  confirmLabel,
  busy,
  disabled,
}: {
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  busy: boolean;
  disabled: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-zinc-100 px-6 py-4">
      <button onClick={onClose} className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-400">
        Cancel
      </button>
      <button
        onClick={onConfirm}
        disabled={busy || disabled}
        className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 btn-press"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {confirmLabel}
      </button>
    </div>
  );
}

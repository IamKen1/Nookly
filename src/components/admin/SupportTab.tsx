"use client";

import { useEffect, useMemo, useState } from "react";
import { Inbox, MailOpen, CheckCircle2, Archive, Send, ChevronLeft } from "lucide-react";
import { formatDateTime } from "@/lib/format";

interface TicketSummary {
  id: string;
  subject: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  priority: string;
  createdAt: string;
  updatedAt: string;
  tenant: { id: string; name: string; slug: string; ownerEmail: string };
  createdByUser: { firstName: string; lastName: string; email: string };
  lastMessage: { authorType: "TENANT" | "ADMIN"; body: string; createdAt: string } | null;
  awaitingReply: boolean;
}

interface TicketDetail extends TicketSummary {
  messages: { id: string; authorType: "TENANT" | "ADMIN"; authorEmail: string; body: string; createdAt: string }[];
}

const FOLDERS = [
  { key: "awaiting", label: "Awaiting reply", icon: Inbox },
  { key: "open", label: "Open", icon: MailOpen },
  { key: "resolved", label: "Resolved", icon: CheckCircle2 },
  { key: "closed", label: "Closed / all", icon: Archive },
] as const;

const STATUS_TONE: Record<string, string> = {
  OPEN: "text-amber-400",
  IN_PROGRESS: "text-blue-400",
  RESOLVED: "text-emerald-400",
  CLOSED: "text-zinc-500",
};

const PRIORITY_TONE: Record<string, string> = {
  URGENT: "bg-red-500/10 text-red-400",
  HIGH: "bg-amber-500/10 text-amber-400",
  NORMAL: "bg-zinc-700/40 text-zinc-300",
  LOW: "bg-zinc-800 text-zinc-500",
};

export default function SupportTab({ adminEmail }: { adminEmail: string }) {
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [folder, setFolder] = useState<(typeof FOLDERS)[number]["key"]>("awaiting");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mobile only: which single panel is showing (desktop shows all 3 side by side).
  const [mobileView, setMobileView] = useState<"folders" | "list" | "thread">("folders");

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/nk-ops-72fq9/support-tickets");
    const data = await res.json();
    setTickets(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    switch (folder) {
      case "awaiting":
        return tickets.filter((t) => t.awaitingReply);
      case "open":
        return tickets.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS");
      case "resolved":
        return tickets.filter((t) => t.status === "RESOLVED");
      case "closed":
      default:
        return tickets;
    }
  }, [tickets, folder]);

  const loadDetail = async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setMobileView("thread");
    const res = await fetch(`/api/nk-ops-72fq9/support-tickets/${id}`);
    if (res.ok) setDetail(await res.json());
  };

  const selectFolder = (key: (typeof FOLDERS)[number]["key"]) => {
    setFolder(key);
    setMobileView("list");
  };

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/nk-ops-72fq9/support-tickets/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to send.");
        return;
      }
      setReply("");
      await Promise.all([load(), loadDetail(selectedId)]);
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status: string) => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await fetch(`/api/nk-ops-72fq9/support-tickets/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await Promise.all([load(), loadDetail(selectedId)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[160px_280px_1fr]" style={{ minHeight: 480 }}>
      <div className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-2 ${mobileView === "folders" ? "block" : "hidden"} sm:block`}>
        {FOLDERS.map((f) => {
          const Icon = f.icon;
          const count = tickets.filter((t) =>
            f.key === "awaiting"
              ? t.awaitingReply
              : f.key === "open"
                ? t.status === "OPEN" || t.status === "IN_PROGRESS"
                : f.key === "resolved"
                  ? t.status === "RESOLVED"
                  : true
          ).length;
          return (
            <button
              key={f.key}
              onClick={() => selectFolder(f.key)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm ${
                folder === f.key ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800/60"
              }`}
            >
              <span className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5" />
                {f.label}
              </span>
              {count > 0 && <span className="text-xs text-zinc-500">{count}</span>}
            </button>
          );
        })}
      </div>

      <div className={`overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 ${mobileView === "list" ? "block" : "hidden"} sm:block`}>
        <button
          onClick={() => setMobileView("folders")}
          className="flex w-full items-center gap-1.5 border-b border-zinc-800/60 px-3 py-2.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 sm:hidden"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Folders
        </button>
        {loading ? (
          <p className="p-4 text-sm text-zinc-500">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">Nothing here.</p>
        ) : (
          filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => loadDetail(t.id)}
              className={`block w-full border-b border-zinc-800/60 px-4 py-3 text-left last:border-0 ${
                selectedId === t.id ? "bg-zinc-800" : "hover:bg-zinc-800/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="truncate text-sm font-medium text-white">{t.tenant.name}</p>
                {t.awaitingReply && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />}
              </div>
              <p className="truncate text-xs text-zinc-400">{t.subject}</p>
              <div className="mt-1 flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${PRIORITY_TONE[t.priority]}`}>{t.priority}</span>
                <span className="text-[10px] text-zinc-500">{formatDateTime(t.updatedAt)}</span>
              </div>
            </button>
          ))
        )}
      </div>

      <div className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5 ${mobileView === "thread" ? "block" : "hidden"} sm:block`}>
        <button
          onClick={() => setMobileView("list")}
          className="mb-3 flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 sm:hidden"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Tickets
        </button>
        {!detail ? (
          <p className="text-sm text-zinc-500">Select a ticket to read it.</p>
        ) : (
          <div className="flex h-full flex-col">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-white">{detail.subject}</h2>
                <p className="text-xs text-zinc-500">
                  {detail.tenant.name} · {detail.createdByUser.email}
                </p>
              </div>
              <select
                value={detail.status}
                onChange={(e) => changeStatus(e.target.value)}
                disabled={busy}
                className={`rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs font-semibold outline-none ${STATUS_TONE[detail.status]}`}
              >
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto">
              {detail.messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-xl border p-3 text-sm ${
                    m.authorType === "ADMIN" ? "border-red-900/40 bg-red-950/20" : "border-zinc-800 bg-zinc-950"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                    <span className="font-medium text-zinc-300">
                      {m.authorType === "ADMIN" ? `You (${m.authorEmail === adminEmail ? "me" : m.authorEmail})` : m.authorEmail}
                    </span>
                    <span>{formatDateTime(m.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-zinc-200">{m.body}</p>
                </div>
              ))}
            </div>

            <form onSubmit={sendReply} className="mt-3 flex gap-2">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Reply to this tenant..."
                className="flex-1 rounded-full border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-white outline-none focus:border-zinc-500"
              />
              <button
                type="submit"
                disabled={busy || !reply.trim()}
                className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                Send
              </button>
            </form>
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

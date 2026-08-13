"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Send, Paperclip, X } from "lucide-react";
import { formatDateTime } from "@/lib/format";

const MAX_ATTACHMENTS = 3;

interface Message {
  id: string;
  authorType: "TENANT" | "ADMIN";
  authorEmail: string;
  body: string;
  attachments: string[];
  createdAt: string;
}

interface Ticket {
  id: string;
  subject: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  priority: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  createdByUser: { firstName: string; lastName: string; email: string };
}

const STATUS_TONE: Record<string, string> = {
  OPEN: "bg-amber-100 text-amber-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  RESOLVED: "bg-emerald-100 text-emerald-700",
  CLOSED: "bg-zinc-100 text-zinc-500",
};

export default function SupportClient() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentFlash, setSentFlash] = useState(false);
  const [newAttachments, setNewAttachments] = useState<string[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const newFileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);

  const uploadScreenshot = async (file: File, onDone: (url: string) => void) => {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Screenshots must be an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Screenshot must be less than 5MB.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "support");
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to upload screenshot.");
        return;
      }
      onDone(data.url);
    } catch {
      setError("Failed to upload screenshot.");
    } finally {
      setUploading(false);
    }
  };

  const load = async (keepSelection = true) => {
    setLoading(true);
    const res = await fetch("/api/support-tickets");
    const data = await res.json();
    const list = Array.isArray(data) ? data : [];
    setTickets(list);
    if (!keepSelection || (selectedId && !list.some((t: Ticket) => t.id === selectedId))) {
      setSelectedId(list[0]?.id ?? null);
    }
    setLoading(false);
  };

  useEffect(() => {
    load(false);
  }, []);

  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/support-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, attachments: newAttachments }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to submit.");
        return;
      }
      setMessage("");
      setNewAttachments([]);
      setComposing(false);
      setSelectedId(data.id);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const submitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/support-tickets/${selected.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply, attachments: replyAttachments }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to send.");
        return;
      }
      setReply("");
      setReplyAttachments([]);
      await load();
      setSentFlash(true);
      setTimeout(() => setSentFlash(false), 2000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Report a problem</h1>
          <p className="mt-1 text-sm text-zinc-500">Reach the Nookly team about issues, bugs, or questions.</p>
        </div>
        <button
          onClick={() => setComposing(true)}
          className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          <Plus className="h-4 w-4" />
          New ticket
        </button>
      </div>

      {composing && (
        <form onSubmit={submitNew} className="mb-6 space-y-3 rounded-2xl border border-zinc-200 bg-white p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">Message</label>
            <textarea
              required
              autoFocus
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what's happening..."
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">Screenshots (optional)</label>
            <div className="flex flex-wrap items-center gap-2">
              {newAttachments.map((url) => (
                <div key={url} className="group relative">
                  <img src={url} alt="Attached screenshot" className="h-14 w-14 rounded-lg border border-zinc-200 object-cover" />
                  <button
                    type="button"
                    onClick={() => setNewAttachments((prev) => prev.filter((u) => u !== url))}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {newAttachments.length < MAX_ATTACHMENTS && (
                <button
                  type="button"
                  onClick={() => newFileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex h-14 w-14 items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 text-zinc-400 hover:border-zinc-400 disabled:opacity-50"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
              )}
              <input
                ref={newFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadScreenshot(file, (url) => setNewAttachments((prev) => [...prev, url]));
                  e.target.value = "";
                }}
              />
            </div>
            <p className="mt-1 text-xs text-zinc-400">Up to {MAX_ATTACHMENTS} images, 5MB each.</p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || uploading}
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Submit
            </button>
            <button
              type="button"
              onClick={() => {
                setComposing(false);
                setNewAttachments([]);
              }}
              className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600 hover:border-zinc-300"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-4 sm:grid-cols-[280px_1fr]">
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          {loading ? (
            <p className="p-4 text-sm text-zinc-400">Loading...</p>
          ) : tickets.length === 0 ? (
            <p className="p-4 text-sm text-zinc-400">No tickets yet.</p>
          ) : (
            tickets.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`block w-full border-b border-zinc-100 px-4 py-3 text-left last:border-0 ${
                  selectedId === t.id ? "bg-emerald-50" : "hover:bg-zinc-50"
                }`}
              >
                <p className="truncate text-sm font-medium text-zinc-900">{t.subject}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[t.status]}`}>{t.status}</span>
                  <span className="text-xs text-zinc-400">{formatDateTime(t.updatedAt)}</span>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          {!selected ? (
            <p className="text-sm text-zinc-400">Select a ticket, or create a new one.</p>
          ) : (
            <div className="flex h-full flex-col">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-900">{selected.subject}</h2>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[selected.status]}`}>
                  {selected.status}
                </span>
              </div>
              <div className="space-y-3">
                {selected.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-xl border p-3 text-sm ${
                      m.authorType === "ADMIN" ? "border-emerald-100 bg-emerald-50" : "border-zinc-100 bg-zinc-50"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                      <span className="font-medium">{m.authorType === "ADMIN" ? "Nookly support" : m.authorEmail}</span>
                      <span>{formatDateTime(m.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-zinc-800">{m.body}</p>
                    {m.attachments?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {m.attachments.map((url) => (
                          <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                            <img src={url} alt="Attached screenshot" className="h-16 w-16 rounded-lg border border-zinc-200 object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {selected.status !== "CLOSED" && (
                <form onSubmit={submitReply} className="mt-4 space-y-2">
                  {replyAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {replyAttachments.map((url) => (
                        <div key={url} className="group relative">
                          <img src={url} alt="Attached screenshot" className="h-14 w-14 rounded-lg border border-zinc-200 object-cover" />
                          <button
                            type="button"
                            onClick={() => setReplyAttachments((prev) => prev.filter((u) => u !== url))}
                            className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Write a reply..."
                      className="flex-1 rounded-full border border-zinc-200 px-4 py-2 text-sm outline-none focus:border-emerald-500"
                    />
                    {replyAttachments.length < MAX_ATTACHMENTS && (
                      <button
                        type="button"
                        onClick={() => replyFileInputRef.current?.click()}
                        disabled={uploading}
                        title="Attach a screenshot"
                        className="flex items-center justify-center rounded-full border border-zinc-200 px-3 text-zinc-500 hover:border-zinc-300 disabled:opacity-50"
                      >
                        <Paperclip className="h-4 w-4" />
                      </button>
                    )}
                    <input
                      ref={replyFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadScreenshot(file, (url) => setReplyAttachments((prev) => [...prev, url]));
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="submit"
                      disabled={busy || uploading || !reply.trim()}
                      className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Send
                    </button>
                  </div>
                </form>
              )}
              {sentFlash && <p className="mt-2 text-sm font-medium text-emerald-600">Reply sent.</p>}
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

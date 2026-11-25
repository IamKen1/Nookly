"use client";

import { Loader2 } from "lucide-react";

// A clear yes/no before anything that changes real receipts or the POS.
export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "emerald",
  busy = false,
  disabled = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "emerald" | "amber";
  busy?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2 className="text-base font-bold text-zinc-900">{title}</h2>
        <div className="mt-2 space-y-2 text-sm text-zinc-600">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-full px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-100">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || disabled}
            className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold text-white shadow disabled:opacity-50 ${
              tone === "amber" ? "bg-amber-600 hover:bg-amber-500" : "bg-emerald-600 hover:bg-emerald-500"
            }`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

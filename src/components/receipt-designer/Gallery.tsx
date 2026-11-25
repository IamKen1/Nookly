"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import type { ReceiptData, ReceiptStoreSettings } from "@/types/receipt";
import type { Template } from "@/lib/receipt-designer/types";
import { PRESETS, buildPreset } from "@/lib/receipt-designer/presets";
import Preview from "./Preview";

// Ready-made looks, each shown with the sale in the preview, to start over from.
export default function Gallery({
  settings,
  paperWidth,
  printMode,
  sample,
  onPick,
  onClose,
}: {
  settings: ReceiptStoreSettings;
  paperWidth: Template["paperWidth"];
  printMode: Template["printMode"];
  sample: ReceiptData | null;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const looks = useMemo(
    () => PRESETS.map((p) => ({ ...p, template: { ...buildPreset(p.key, settings, paperWidth), printMode } })),
    [settings, paperWidth, printMode]
  );
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-900/50 p-2 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Gallery of ready-made looks"
        className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 p-4">
          <div>
            <h2 className="text-base font-bold text-zinc-900">Gallery of ready-made looks</h2>
            <p className="text-xs text-zinc-500">
              Shown with your store details and the sale in the preview. Picking one replaces what&apos;s on the receipt now; Undo brings it back.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto bg-zinc-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {looks.map((l) => (
            <div key={l.key} className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <div className="relative h-80 overflow-hidden bg-zinc-100">
                {/* A scaled-down, read-only receipt. */}
                <div className="pointer-events-none absolute left-1/2 top-3 w-[420px] origin-top -translate-x-1/2 scale-[0.62]">
                  {sample ? <Preview template={l.template} data={sample} selected={null} onSelect={() => {}} interactive={false} /> : null}
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-white to-transparent" />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <p className="text-sm font-semibold text-zinc-900">{l.label}</p>
                <p className="flex-1 text-xs leading-snug text-zinc-500">{l.description}</p>
                <button
                  type="button"
                  onClick={() => onPick(l.key)}
                  className="self-start rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  Use this look
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
